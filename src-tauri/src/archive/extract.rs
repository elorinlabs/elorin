use super::*;
use cap_std::fs::{Dir, OpenOptions};
use std::{collections::HashSet, sync::Condvar, time::Duration};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub state: String,
    pub files: usize,
    pub bytes: u64,
    pub total_files: usize,
    pub total_bytes: u64,
    pub skipped: usize,
    pub path: Option<String>,
    pub error: Option<String>,
    pub warnings: Vec<String>,
}
pub struct Operation {
    pub status: Mutex<Status>,
    pub cancelled: AtomicBool,
    decision: Mutex<Option<(String, bool)>>,
    wake: Condvar,
}
impl Operation {
    pub fn new(total_files: usize, total_bytes: u64) -> Self {
        Self {
            status: Mutex::new(Status {
                state: "running".into(),
                files: 0,
                bytes: 0,
                total_files,
                total_bytes,
                skipped: 0,
                path: None,
                error: None,
                warnings: vec![],
            }),
            cancelled: AtomicBool::new(false),
            decision: Mutex::new(None),
            wake: Condvar::new(),
        }
    }
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
        self.wake.notify_all()
    }
    pub fn resolve(&self, policy: String, all: bool) -> Result<(), FileError> {
        if !["skip", "replace", "keep-both"].contains(&policy.as_str()) {
            return Err(err("EXTRACTION_CONFLICT", "Invalid conflict policy"));
        }
        *self.decision.lock().unwrap() = Some((policy, all));
        self.wake.notify_all();
        Ok(())
    }
    fn check(&self) -> Result<(), FileError> {
        if self.cancelled.load(Ordering::Relaxed) {
            Err(err(
                "CANCELLED",
                "Cancelled — completed files are retained; incomplete files are removed",
            ))
        } else {
            Ok(())
        }
    }
    fn conflict(&self, path: &str) -> Result<(String, bool), FileError> {
        let mut decision = self.decision.lock().unwrap();
        *decision = None;
        {
            let mut s = self.status.lock().unwrap();
            s.state = "conflict".into();
            s.path = Some(path.into());
        }
        loop {
            self.check()?;
            if let Some(value) = decision.take() {
                self.status.lock().unwrap().state = "running".into();
                return Ok(value);
            }
            decision = self
                .wake
                .wait_timeout(decision, Duration::from_millis(250))
                .unwrap()
                .0;
        }
    }
}
pub fn output_path(raw: &str) -> Result<PathBuf, FileError> {
    let path = virtual_path(raw)?;
    for name in path.split('/') {
        if name.ends_with('.') || name.ends_with(' ') || name.chars().any(|c| "<>\"|?*".contains(c))
        {
            return Err(err("UNSAFE_PATH", "Entry name is unsafe on Windows"));
        }
        let stem = name.split('.').next().unwrap().to_ascii_uppercase();
        if ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
            || (stem.starts_with("COM") || stem.starts_with("LPT"))
                && stem.len() == 4
                && matches!(stem.as_bytes()[3], b'1'..=b'9')
        {
            return Err(err("UNSAFE_PATH", "Reserved Windows device name"));
        }
    }
    Ok(PathBuf::from(path))
}
fn verify_existing(root: &Dir, path: &Path) -> Result<(), FileError> {
    let mut part = PathBuf::new();
    for component in path.components() {
        part.push(component);
        match root.symlink_metadata(&part) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() {
                    return Err(err(
                        "UNSAFE_PATH",
                        "Existing symlink/reparse target is not used for extraction",
                    ));
                }
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(ioerr(e)),
        }
    }
    Ok(())
}
fn exists(root: &Dir, path: &Path) -> bool {
    root.symlink_metadata(path).is_ok()
}
fn duplicate(root: &Dir, path: &Path, used: &HashSet<String>) -> Result<PathBuf, FileError> {
    let parent = path.parent().unwrap_or(Path::new(""));
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = path
        .extension()
        .map(|x| format!(".{}", x.to_string_lossy()))
        .unwrap_or_default();
    for n in 1..100_000 {
        let candidate = parent.join(format!("{stem} ({n}){ext}"));
        if !exists(root, &candidate) && !used.contains(&candidate.to_string_lossy().to_lowercase())
        {
            return Ok(candidate);
        }
    }
    Err(err(
        "EXTRACTION_CONFLICT",
        "Unable to choose a safe duplicate filename",
    ))
}
pub fn run(
    session: Arc<Session>,
    root: Dir,
    entries: Vec<Entry>,
    operation: Arc<Operation>,
    mut policy: String,
    password: Option<String>,
) {
    let result = (|| {
        if !["ask", "skip", "replace", "keep-both"].contains(&policy.as_str()) {
            return Err(err("EXTRACTION_CONFLICT", "Invalid overwrite policy"));
        }
        let mut used = HashSet::new();
        for entry in entries {
            operation.check()?;
            if entry.kind != "file" && entry.kind != "directory" || entry.unsafe_reason.is_some() {
                let mut s = operation.status.lock().unwrap();
                s.skipped += 1;
                if s.warnings.len() < 100 {
                    s.warnings.push(format!(
                        "Entry #{} skipped: unsafe path, link, special file or safety budget",
                        entry.id
                    ))
                }
                continue;
            }
            let mut path = match output_path(&entry.path) {
                Ok(path) => path,
                Err(error) => {
                    let mut s = operation.status.lock().unwrap();
                    s.skipped += 1;
                    if s.warnings.len() < 100 {
                        s.warnings
                            .push(format!("Entry #{}: {}", entry.id, error.message))
                    }
                    continue;
                }
            };
            verify_existing(&root, &path)?;
            if entry.kind == "directory" {
                root.create_dir_all(&path).map_err(ioerr)?;
                continue;
            }
            if let Some(parent) = path.parent() {
                if !parent.as_os_str().is_empty() {
                    root.create_dir_all(parent).map_err(ioerr)?
                }
            }
            verify_existing(&root, &path)?;
            let key = path.to_string_lossy().to_lowercase();
            let mut decision = policy.clone();
            if exists(&root, &path) || used.contains(&key) {
                if decision == "ask" {
                    let (next, all) = operation.conflict(&entry.path)?;
                    decision = next;
                    if all {
                        policy = decision.clone()
                    }
                }
                if decision == "skip" {
                    operation.status.lock().unwrap().skipped += 1;
                    continue;
                }
                if decision == "keep-both" {
                    path = duplicate(&root, &path, &used)?;
                }
                if decision == "replace"
                    && root
                        .symlink_metadata(&path)
                        .map(|m| !m.is_file())
                        .unwrap_or(false)
                {
                    return Err(err(
                        "EXTRACTION_CONFLICT",
                        "Replace only supports regular files",
                    ));
                }
            }
            let parent = path.parent().unwrap_or(Path::new(""));
            let temporary = parent.join(format!(".prism-extract-{}.partial", uuid::Uuid::new_v4()));
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            let mut file = root.open_with(&temporary, &options).map_err(ioerr)?;
            operation.status.lock().unwrap().path = Some(entry.path.clone());
            let written = session.stream(entry.id, password.as_deref(), &mut |bytes| {
                operation.check()?;
                file.write_all(bytes).map_err(ioerr)?;
                let mut status = operation.status.lock().unwrap();
                status.bytes += bytes.len() as u64;
                if status.bytes > EXPANDED_BYTES {
                    return Err(err(
                        "SAFETY_LIMIT",
                        "Extraction expanded-byte budget reached",
                    ));
                }
                Ok(())
            });
            if let Err(error) = written {
                drop(file);
                let _ = root.remove_file(&temporary);
                return Err(error);
            }
            if let Err(error) = file.sync_all() {
                drop(file);
                let _ = root.remove_file(&temporary);
                return Err(ioerr(error));
            }
            drop(file);
            operation.check().inspect_err(|_| {
                let _ = root.remove_file(&temporary);
            })?;
            verify_existing(&root, &path).inspect_err(|_| {
                let _ = root.remove_file(&temporary);
            })?;
            // Reserve a previously absent output atomically. Only explicit Replace may replace an existing file.
            if decision != "replace" {
                let mut reserve = OpenOptions::new();
                reserve.write(true).create_new(true);
                match root.open_with(&path, &reserve) {
                    Ok(file) => drop(file),
                    Err(error) => {
                        let _ = root.remove_file(&temporary);
                        return Err(ioerr(error));
                    }
                }
            }
            if let Err(error) = root.rename(&temporary, &root, &path) {
                let _ = root.remove_file(&temporary);
                if decision != "replace" {
                    let _ = root.remove_file(&path);
                }
                return Err(ioerr(error));
            }
            used.insert(path.to_string_lossy().to_lowercase());
            operation.status.lock().unwrap().files += 1;
        }
        Ok(())
    })();
    let mut status = operation.status.lock().unwrap();
    match result {
        Ok(()) => status.state = "complete".into(),
        Err(error) => {
            status.state = if error.code == "CANCELLED" {
                "cancelled"
            } else {
                "error"
            }
            .into();
            status.error = Some(error.message)
        }
    }
}
impl Archives {
    pub fn extract_to(
        &self,
        session_id: &str,
        root: Dir,
        ids: Option<Vec<usize>>,
        policy: String,
        password: Option<String>,
    ) -> Result<String, FileError> {
        let session = self.get(session_id)?;
        if !session.info.lock().unwrap().complete {
            return Err(err(
                "INDEXING",
                "Wait for archive indexing before extraction",
            ));
        }
        let all = session.entries.lock().unwrap();
        let entries: Vec<_> = if let Some(ids) = ids {
            let selected: HashSet<_> = ids.into_iter().collect();
            let directories: Vec<_> = all
                .iter()
                .filter(|e| selected.contains(&e.id) && e.kind == "directory")
                .map(|e| format!("{}/", e.path.trim_end_matches('/')))
                .collect();
            all.iter()
                .filter(|e| {
                    selected.contains(&e.id) || directories.iter().any(|p| e.path.starts_with(p))
                })
                .cloned()
                .collect()
        } else {
            all.clone()
        };
        drop(all);
        let total = entries
            .iter()
            .filter(|e| e.kind == "file")
            .try_fold(0u64, |sum, e| sum.checked_add(e.size))
            .ok_or_else(|| err("SAFETY_LIMIT", "Expanded size overflow"))?;
        if total > EXPANDED_BYTES {
            return Err(err(
                "SAFETY_LIMIT",
                "Extraction exceeds 2 GiB operation budget; choose a smaller selection",
            ));
        }
        let mut operations = self.operations.lock().unwrap();
        operations.retain(|_, op| {
            ["running", "conflict"].contains(&op.status.lock().unwrap().state.as_str())
        });
        if operations.len() >= 2 {
            return Err(err(
                "SAFETY_LIMIT",
                "At most two extraction operations may run",
            ));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let operation = Arc::new(Operation::new(
            entries.iter().filter(|e| e.kind == "file").count(),
            total,
        ));
        operations.insert(id.clone(), operation.clone());
        std::thread::spawn(move || run(session, root, entries, operation, policy, password));
        Ok(id)
    }
    pub fn operation(&self, id: &str) -> Result<Arc<Operation>, FileError> {
        self.operations
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| err("ENTRY_UNAVAILABLE", "Extraction operation is unavailable"))
    }
}

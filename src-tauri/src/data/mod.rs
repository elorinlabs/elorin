//! Generated, parameterized read-only SQLite operations. No SQL execution API.
use crate::{
    archive::{Archives, Data},
    file_io::{FileAccess, FileError},
};
use rusqlite::{params_from_iter, types::Value, Connection, OpenFlags};
use serde::Deserialize;
use serde_json::{json, Value as Json};
use std::{
    collections::HashMap,
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::Manager;
struct Handle {
    db: Mutex<Connection>,
    closed: Arc<AtomicBool>,
    _temp: Option<crate::archive::temp_store::OwnedTemp>,
}
#[derive(Default)]
pub struct DataHandles(Mutex<HashMap<String, Arc<Handle>>>);
fn error(e: impl std::fmt::Display) -> FileError {
    FileError::new("DATA_READ_FAILED", format!("Read-only database: {e}"))
}
fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}
fn immutable(path: &Path) -> String {
    let s = path.to_string_lossy().replace('\\', "/");
    let s = s.strip_prefix("//?/").unwrap_or(&s);
    let mut uri = String::from("file:");
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"/:._-".contains(&b) {
            uri.push(b as char)
        } else {
            uri.push_str(&format!("%{b:02X}"));
        }
    }
    uri.push_str("?mode=ro&immutable=1");
    uri
}
fn configure(db: &Connection, closed: Arc<AtomicBool>) -> Result<(), FileError> {
    db.set_limit(
        rusqlite::limits::Limit::SQLITE_LIMIT_LENGTH,
        16 * 1024 * 1024,
    )
    .map_err(error)?;
    db.set_limit(
        rusqlite::limits::Limit::SQLITE_LIMIT_SQL_LENGTH,
        1024 * 1024,
    )
    .map_err(error)?;
    db.set_limit(rusqlite::limits::Limit::SQLITE_LIMIT_COLUMN, 4096)
        .map_err(error)?;
    db.set_limit(rusqlite::limits::Limit::SQLITE_LIMIT_EXPR_DEPTH, 128)
        .map_err(error)?;
    db.execute_batch("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-8192;").map_err(error)?;
    // Extension loading remains disabled: bundled SQLite has no load_extension feature.
    let deadline = Instant::now() + Duration::from_secs(5);
    db.progress_handler(
        1000,
        Some(move || closed.load(Ordering::Relaxed) || Instant::now() > deadline),
    )
    .map_err(error)?;
    db.authorizer(Some(|context: rusqlite::hooks::AuthContext<'_>| {
        use rusqlite::hooks::{AuthAction as A, Authorization as R};
        match context.action {
            A::Select | A::Read { .. } | A::Recursive => R::Allow,
            A::Function { function_name }
                if function_name != "load_extension"
                    && function_name != "writefile"
                    && function_name != "readfile" =>
            {
                R::Allow
            }
            A::Pragma { pragma_name, .. }
                if [
                    "query_only",
                    "trusted_schema",
                    "temp_store",
                    "cache_size",
                    "table_xinfo",
                    "foreign_key_list",
                    "index_list",
                    "index_info",
                ]
                .contains(&pragma_name) =>
            {
                R::Allow
            }
            _ => R::Deny,
        }
    }))
    .map_err(error)?;
    Ok(())
}
#[derive(Deserialize)]
pub struct OpenSource {
    path: Option<String>,
    session: Option<String>,
    entry: Option<usize>,
}
#[tauri::command]
pub async fn data_sqlite_open(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    source: OpenSource,
) -> Result<String, FileError> {
    let owner=window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let temp;
        let path = if let Some(path) = source.path {
            let access = app.state::<FileAccess>();
            let p = access.authorized_path(Path::new(&path))?;
            let mut pinned = access.authorized_file(&p)?;
            let before = pinned.metadata().map_err(error)?;
            pinned.seek(SeekFrom::Start(0)).map_err(error)?;
            if before.len() > 8 * 1024 * 1024 * 1024 {
                return Err(error(
                    "Safety limit reached: SQLite disk snapshot exceeds 8 GiB",
                ));
            }
            let mut owned = crate::archive::temp_store::create()?;
            let mut buffer = vec![0u8; 1024 * 1024];
            let mut copied = 0u64;
            loop {
                let n = pinned.read(&mut buffer).map_err(error)?;
                if n == 0 {
                    break;
                }
                copied += n as u64;
                if copied > before.len() {
                    return Err(error("Database changed while creating snapshot"));
                }
                owned.write_all(&buffer[..n]).map_err(error)?;
            }
            let after = pinned.metadata().map_err(error)?;
            if copied != before.len() || before.modified().ok() != after.modified().ok() {
                return Err(error(
                    "Database changed while creating snapshot; try again when the writer is idle",
                ));
            }
            owned.flush().map_err(error)?;
            let snapshot = owned.path().to_path_buf();
            temp = Some(owned);
            snapshot
        } else {
            let session = app.state::<Archives>().get(
                &source
                    .session
                    .ok_or_else(|| error("Missing virtual source"))?,
            )?;
            let data: Arc<Data> = session.prepare(
                source.entry.ok_or_else(|| error("Missing virtual entry"))?,
                None,
            )?;
            let mut owned = crate::archive::temp_store::create()?;
            for at in (0..data.size()).step_by(1024 * 1024) {
                owned
                    .write_all(&data.read_at(at, 1024 * 1024).map_err(error)?)
                    .map_err(error)?;
            }
            owned.flush().map_err(error)?;
            let p = owned.path().to_path_buf();
            temp = Some(owned);
            p
        };
        let mut header = [0u8; 16];
        std::fs::File::open(&path)
            .map_err(error)?
            .read_exact(&mut header)
            .map_err(error)?;
        if &header != b"SQLite format 3\0" {
            return Err(error("Encrypted or unsupported SQLite database"));
        }
        let db = Connection::open_with_flags(
            immutable(&path),
            OpenFlags::SQLITE_OPEN_READ_ONLY
                | OpenFlags::SQLITE_OPEN_URI
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(error)?;
        let closed = Arc::new(AtomicBool::new(false));
        configure(&db, closed.clone())?;
        db.query_row("SELECT count(*) FROM sqlite_schema", [], |r| {
            r.get::<_, i64>(0)
        })
        .map_err(error)?;
        let id = uuid::Uuid::new_v4().to_string();
        let state = app.state::<DataHandles>();
        let mut handles = state.0.lock().map_err(error)?;
        if handles.len() >= 8 {
            return Err(error("Safety limit reached: live database handles"));
        }
        handles.insert(
            id.clone(),
            Arc::new(Handle {
                db: Mutex::new(db),
                closed,
                _temp: temp,
            }),
        );
        drop(handles);
        crate::window_resources::register(&app,&owner,crate::window_resources::Kind::Database,&id)?;
        Ok(id)
    })
    .await
    .map_err(error)?
}
#[derive(Deserialize)]
pub struct Filter {
    column: usize,
    op: String,
    value: String,
}
#[derive(Deserialize)]
pub struct Request {
    node: String,
    start: usize,
    count: usize,
    columns: Vec<usize>,
    filter: Option<Filter>,
    cursor: Option<String>,
}
fn schema(db: &Connection) -> Result<Json, FileError> {
    let mut stmt = db
        .prepare("SELECT name,type,tbl_name,sql FROM sqlite_schema ORDER BY type,name LIMIT 10001")
        .map_err(error)?;
    let mut rows = stmt.query([]).map_err(error)?;
    let mut nodes = Vec::new();
    while let Some(r) = rows.next().map_err(error)? {
        let name: String = r.get(0).map_err(error)?;
        let kind: String = r.get(1).map_err(error)?;
        let sql: Option<String> = r.get(3).map_err(error)?;
        if name.starts_with("sqlite_") {
            continue;
        }
        let cols = columns(db, &name)?;
        let mut fks = db
            .prepare("SELECT * FROM pragma_foreign_key_list(?1)")
            .map_err(error)?;
        let foreign=fks.query_map([&name],|r|Ok(json!({"table":r.get::<_,String>(2)?,"from":r.get::<_,String>(3)?,"to":r.get::<_,Option<String>>(4)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
        let table: String = r.get(2).map_err(error)?;
        let mut indices = db
            .prepare("SELECT name,\"unique\",partial FROM pragma_index_list(?1) LIMIT 256")
            .map_err(error)?;
        let index_list = indices
            .query_map([&table], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        let mut indexes = Vec::new();
        for (index, unique, partial) in index_list {
            let mut info = db
                .prepare("SELECT name FROM pragma_index_info(?1) LIMIT 256")
                .map_err(error)?;
            let names = info
                .query_map([&index], |r| r.get::<_, Option<String>>(0))
                .map_err(error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(error)?;
            indexes.push(
                json!({"name":index,"columns":names,"unique":unique!=0,"partial":partial!=0}),
            );
        }
        nodes.push(json!({"id":name,"name":name,"kind":kind,"columns":cols,"metadata":{"sql":sql.as_ref().map(|s|s.chars().take(8192).collect::<String>()),"table":table,"foreignKeys":foreign,"indexes":indexes,"readOnly":true,"snapshot":"Base database only; WAL sidecars are not read","withoutRowid":sql.as_deref().unwrap_or("").to_uppercase().contains("WITHOUT ROWID"),"strict":sql.as_deref().unwrap_or("").trim_end().trim_end_matches(';').trim_end().ends_with("STRICT")}}));
        if nodes.len() > 10000 {
            return Err(error("Safety limit reached: schema objects"));
        }
    }
    Ok(json!(nodes))
}
fn columns(db: &Connection, name: &str) -> Result<Vec<Json>, FileError> {
    let mut stmt = db
        .prepare("SELECT name,type,\"notnull\",pk,hidden FROM pragma_table_xinfo(?1) LIMIT 4097")
        .map_err(error)?;
    let cols=stmt.query_map([name],|r|Ok(json!({"name":r.get::<_,String>(0)?,"type":r.get::<_,String>(1)?,"nullable":r.get::<_,i64>(2)?==0,"metadata":{"primaryKeyOrder":r.get::<_,i64>(3)?,"generated":r.get::<_,i64>(4)?}}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
    if cols.len() > 4096 {
        return Err(error("Safety limit reached: columns"));
    }
    Ok(cols)
}
fn page(db: &Connection, r: Request) -> Result<Json, FileError> {
    if r.count == 0 || r.count > 200 || r.columns.len() > 32 || r.start > 100_000_000 {
        return Err(error("Safety limit reached: page"));
    }
    let cols = columns(db, &r.node)?;
    if cols.is_empty() {
        return Err(error("No queryable columns"));
    }
    let schema_sql: String = db
        .query_row(
            "SELECT coalesce(sql,'') FROM sqlite_schema WHERE name=?1 AND type IN ('table','view')",
            [&r.node],
            |r| r.get(0),
        )
        .map_err(error)?;
    let rowkey = if !schema_sql
        .trim_start()
        .to_uppercase()
        .starts_with("CREATE TABLE")
        || schema_sql.to_uppercase().contains("WITHOUT ROWID")
    {
        None
    } else {
        ["rowid", "_rowid_", "oid"].into_iter().find(|key| {
            !cols
                .iter()
                .any(|c| c["name"].as_str().unwrap_or("").eq_ignore_ascii_case(key))
        })
    };
    let mut projection = Vec::new();
    for i in &r.columns {
        let c = quote(
            cols.get(*i)
                .and_then(|c| c["name"].as_str())
                .ok_or_else(|| error("Invalid column"))?,
        );
        projection.push(format!("typeof({c}),length(CAST({c} AS BLOB)),CASE WHEN typeof({c})='blob' THEN hex(substr({c},1,64)) WHEN typeof({c})='text' THEN substr({c},1,8192) WHEN typeof({c})='real' THEN {c} ELSE CAST({c} AS TEXT) END"));
    }
    let mut args = Vec::<Value>::new();
    let mut predicates = Vec::new();
    if let Some(f) = r.filter {
        let c = quote(
            cols.get(f.column)
                .and_then(|c| c["name"].as_str())
                .ok_or_else(|| error("Invalid filter column"))?,
        );
        if f.value.len() > 8192 {
            return Err(error("Filter too long"));
        }
        match f.op.as_str() {
            "null" => predicates.push(format!("{c} IS NULL")),
            "contains" => {
                predicates.push(format!("typeof({c})='text' AND instr({c},?)>0"));
                args.push(Value::Text(f.value));
            }
            op @ ("equals" | "greater" | "less") => {
                predicates.push(format!(
                    "{c} {} ?",
                    match op {
                        "equals" => "=",
                        "greater" => ">",
                        _ => "<",
                    }
                ));
                args.push(if let Ok(n) = f.value.parse::<i64>() {
                    Value::Integer(n)
                } else if let Ok(n) = f.value.parse::<f64>() {
                    if !n.is_finite() {
                        return Err(error("Non-finite filter"));
                    }
                    Value::Real(n)
                } else {
                    Value::Text(f.value)
                });
            }
            _ => return Err(error("Unsupported filter")),
        }
    }
    let keyset = rowkey.is_some() && r.cursor.is_some();
    if let (Some(key), Some(cursor)) = (rowkey, &r.cursor) {
        predicates.push(format!("{} > ?", quote(key)));
        args.push(Value::Integer(cursor.parse().map_err(error)?));
    }
    let key_expr = rowkey.map(quote).unwrap_or("NULL".into());
    let mut sql = format!(
        "SELECT {key_expr},{} FROM {}",
        projection.join(","),
        quote(&r.node)
    );
    if !predicates.is_empty() {
        sql.push_str(&format!(" WHERE {}", predicates.join(" AND ")));
    }
    if let Some(key) = rowkey {
        sql.push_str(&format!(" ORDER BY {}", quote(key)));
    }
    sql.push_str(" LIMIT ? OFFSET ?");
    args.push(Value::Integer((r.count + 1) as i64));
    args.push(Value::Integer(if keyset { 0 } else { r.start as i64 }));
    let mut stmt = db.prepare(&sql).map_err(error)?;
    let mut result = stmt.query(params_from_iter(args)).map_err(error)?;
    let mut values = Vec::new();
    let mut cursor = None;
    while let Some(row) = result.next().map_err(error)? {
        if values.len() == r.count {
            return Ok(
                json!({"start":r.start,"columns":r.columns,"values":values,"hasMore":true,"cursor":cursor}),
            );
        }
        cursor = row
            .get::<_, Option<i64>>(0)
            .map_err(error)?
            .map(|n| n.to_string());
        let mut cells = Vec::new();
        for j in 0..r.columns.len() {
            let at = 1 + j * 3;
            let t: String = row.get(at).map_err(error)?;
            let size: Option<i64> = row.get(at + 1).map_err(error)?;
            let raw: Option<String> = match row.get_ref(at + 2).map_err(error)? {
                rusqlite::types::ValueRef::Real(v) => Some(if v == 0.0 && v.is_sign_negative() {
                    "-0.0".into()
                } else {
                    v.to_string()
                }),
                _ => row.get(at + 2).map_err(error)?,
            };
            let raw = raw.unwrap_or_default();
            let display = match t.as_str() {
                "null" => "NULL".into(),
                "blob" => format!("BLOB · {} bytes", size.unwrap_or(0)),
                _ => raw.clone(),
            };
            cells.push(json!({"raw":raw,"display":display,"type":t,"size":size,"truncated":size.unwrap_or(0)>if t=="blob"{64}else{8192}}));
        }
        values.push(cells);
    }
    Ok(json!({"start":r.start,"columns":r.columns,"values":values,"hasMore":false,"cursor":cursor}))
}
#[tauri::command]
pub async fn data_sqlite_read(
    app: tauri::AppHandle,
    handle: String,
    operation: String,
    request: Option<Request>,
    node: Option<String>,
) -> Result<Json, FileError> {
    let h = app
        .state::<DataHandles>()
        .0
        .lock()
        .map_err(error)?
        .get(&handle)
        .cloned()
        .ok_or_else(|| error("Closed database"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let db = h.db.lock().map_err(error)?;
        configure(&db, h.closed.clone())?;
        match operation.as_str() {
            "schema" => schema(&db),
            "page" => page(&db, request.ok_or_else(|| error("Missing page"))?),
            "count" => {
                let name = node.ok_or_else(|| error("Missing table"))?;
                let _: String = db
                    .query_row(
                        "SELECT name FROM sqlite_schema WHERE name=?1 AND type IN ('table','view')",
                        [&name],
                        |r| r.get(0),
                    )
                    .map_err(error)?;
                let n = db
                    .query_row(&format!("SELECT count(*) FROM {}", quote(&name)), [], |r| {
                        r.get::<_, i64>(0)
                    })
                    .map_err(error)?;
                Ok(json!(n))
            }
            _ => Err(error("Unsupported operation")),
        }
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub fn data_sqlite_close(app: tauri::AppHandle, handle: String) {
    app.state::<crate::window_resources::WindowResources>().forget(crate::window_resources::Kind::Database,&handle);
    if let Ok(mut map) = app.state::<DataHandles>().0.lock() {
        if let Some(h) = map.remove(&handle) {
            h.closed.store(true, Ordering::Relaxed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn open(name: &str) -> Connection {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../test-fixtures/data/sqlite")
            .join(name);
        let db = Connection::open_with_flags(
            immutable(&path),
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )
        .unwrap();
        configure(&db, Arc::new(AtomicBool::new(false))).unwrap();
        db
    }
    #[test]
    fn readonly_source_unchanged_and_extensions_disabled() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("数 据#.sqlite");
        std::fs::copy(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-fixtures/data/sqlite/basic.sqlite"),
            &path,
        )
        .unwrap();
        let before = std::fs::read(&path).unwrap();
        let time = path.metadata().unwrap().modified().unwrap();
        let db = Connection::open_with_flags(
            immutable(&path),
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )
        .unwrap();
        configure(&db, Arc::new(AtomicBool::new(false))).unwrap();
        assert!(db.execute("INSERT INTO users(id) VALUES(42)", []).is_err());
        assert!(db
            .query_row("SELECT load_extension('evil.dll')", [], |r| r
                .get::<_, String>(0))
            .is_err());
        schema(&db).unwrap();
        drop(db);
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert_eq!(path.metadata().unwrap().modified().unwrap(), time);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn schemas_and_keys() {
        for n in [
            "foreign-keys.sqlite",
            "indexes.sqlite",
            "triggers.sqlite",
            "views.sqlite",
            "without-rowid.sqlite",
            "composite-key.sqlite",
        ] {
            assert!(!schema(&open(n)).unwrap().as_array().unwrap().is_empty());
        }
    }
    #[test]
    fn pages_exact_blob_and_parameterization() {
        let db = open("basic.sqlite");
        let p = page(
            &db,
            Request {
                node: "users".into(),
                start: 0,
                count: 200,
                columns: vec![0, 1, 5],
                filter: None,
                cursor: None,
            },
        )
        .unwrap();
        assert_eq!(p["values"][2][0]["raw"], "9007199254740993");
        assert_eq!(p["values"][0][2]["size"], 8);
        let p = page(
            &db,
            Request {
                node: "users".into(),
                start: 0,
                count: 200,
                columns: vec![0],
                filter: Some(Filter {
                    column: 1,
                    op: "contains".into(),
                    value: "' OR 1=1 --".into(),
                }),
                cursor: None,
            },
        )
        .unwrap();
        assert!(p["values"].as_array().unwrap().is_empty());
    }
    #[test]
    fn million_rows_keyset_and_without_rowid() {
        let db = open("large.sqlite");
        let p = page(
            &db,
            Request {
                node: "events".into(),
                start: 999900,
                count: 100,
                columns: vec![0, 1],
                filter: None,
                cursor: Some("999900".into()),
            },
        )
        .unwrap();
        assert_eq!(p["values"][0][0]["raw"], "999901");
        let db = open("without-rowid.sqlite");
        let p = page(
            &db,
            Request {
                node: "records".into(),
                start: 0,
                count: 100,
                columns: vec![0, 1],
                filter: None,
                cursor: None,
            },
        )
        .unwrap();
        assert_eq!(p["values"].as_array().unwrap().len(), 2);
    }
}

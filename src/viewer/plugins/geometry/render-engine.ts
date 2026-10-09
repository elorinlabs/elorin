import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GeometryDocumentModel, GeometryNode, Vec3 } from "./types";
import { GEOMETRY_LIMITS as L } from "./config";
export class GeometryRenderEngine {
  readonly scene = new T.Scene();
  readonly renderer: T.WebGLRenderer;
  readonly root = new T.Group();
  readonly objects = new Map<string, T.Object3D>();
  private perspective = new T.PerspectiveCamera(45, 1, 0.01, 1000);
  private orthographic = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  camera: T.Camera;
  controls: OrbitControls;
  private geometries = new Set<T.BufferGeometry>();
  private materials = new Set<T.Material>();
  private textures = new Set<T.Texture>();
  private resize: ResizeObserver;
  private viewportSize: [number,number] = [0,0];
  private frame = 0;
  private alive = true;
  private active = true;
  private contextLost = false;
  private lost = (event: Event) => { event.preventDefault(); this.contextLost=true; this.renderer.domElement.dataset.contextState='lost';cancelAnimationFrame(this.frame); this.frame=0; };
  private restored = () => { this.contextLost=false;this.renderer.domElement.dataset.contextState='restored';this.invalidate(); };
  private center: T.Vector3;
  private scale: number;
  private grid: T.GridHelper;
  private measureLine?: T.Line;
  private selected?: string;
  private highlight?: T.BoxHelper | T.Box3Helper;
  private hidden = new Set<string>();
  private edgeObjects: T.LineSegments[] = [];
  shadedEdges(enabled:boolean) {
    if(!this.edgeObjects.length&&enabled){
      const meshes=[...this.objects.values()].filter((o):o is T.Mesh=>o instanceof T.Mesh);
      const unique=new Set(meshes.map(m=>m.geometry));
      const estimate=[...unique].reduce((n,g)=>n+(g.index?.count??g.attributes.position.count)*24,0);
      const original=Number(this.document.metadata.geometryBytes??0)+Number(this.document.metadata.textureGpuBytes??0);
      if(estimate+original>L.gpuBytes)throw Error('Shaded edges exceed GPU budget');
      const cache=new Map<T.BufferGeometry,T.WireframeGeometry>();
      for(const mesh of meshes){let geometry=cache.get(mesh.geometry);if(!geometry){geometry=new T.WireframeGeometry(mesh.geometry);cache.set(mesh.geometry,geometry);this.geometries.add(geometry);}const material=new T.LineBasicMaterial({color:0x243749,transparent:true,opacity:.65});this.materials.add(material);const edges=new T.LineSegments(geometry,material);mesh.add(edges);this.edgeObjects.push(edges);}
    }
    for(const edges of this.edgeObjects)edges.visible=enabled;
    this.invalidate();
  }
  private nodeMap: Map<string, GeometryNode>;
  private layerIds: Map<string, string>;
  constructor(
    readonly element: HTMLElement,
    readonly document: GeometryDocumentModel,
    private pick: (id?: string, point?: Vec3) => void,
  ) {
    const initStart=performance.now();
    this.nodeMap = new Map(document.nodes.map((n) => [n.id, n]));
    this.layerIds = new Map(
      document.nodes
        .filter((n) => n.type === "layer")
        .map((n) => [n.name, n.id]),
    );
    this.hidden = new Set(
      document.nodes.filter((n) => !n.visible).map((n) => n.id),
    );
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, L.dpr));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.setClearColor(0, 0);
    element.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost',this.lost);
    this.renderer.domElement.addEventListener('webglcontextrestored',this.restored);
    this.camera =
      document.category === "drawing" ? this.orthographic : this.perspective;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = document.category !== "drawing";
    if (document.category === "drawing")
      this.controls.mouseButtons.LEFT = T.MOUSE.PAN;
    this.controls.mouseButtons.MIDDLE = T.MOUSE.PAN;
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", this.invalidate);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x747d88, 2));
    const light = new T.DirectionalLight(0xffffff, 2.5);
    light.position.set(2, 3, 5);
    this.scene.add(light);
    this.scene.add(this.root);
    const bounds = new T.Box3(
      new T.Vector3(...document.bounds.min),
      new T.Vector3(...document.bounds.max),
    );
    this.center = bounds.getCenter(new T.Vector3());
    this.scale = Math.max(bounds.getSize(new T.Vector3()).length(), 1e-9);
    this.root.position.copy(this.center).negate();
    const mats = document.materials.map((m) => {
      const material = new T.MeshStandardMaterial({
        color: new T.Color(
          ...((m.color ?? [0.52, 0.6, 0.67]) as [number, number, number]),
        ),
        metalness: m.metalness ?? 0,
        roughness: m.roughness ?? 0.7,
        opacity: m.opacity ?? 1,
        transparent: m.transparent ?? (m.opacity ?? 1) < 1,
        alphaTest: m.alphaTest ?? 0,
        side: m.doubleSided === false ? T.FrontSide : T.DoubleSide,
      });
      if (m.image) {
        const texture = new T.Texture(m.image);
        texture.colorSpace = T.SRGBColorSpace;
        texture.flipY = false;
        texture.needsUpdate = true;
        material.map = texture;
        this.textures.add(texture);
      }
      this.materials.add(material);
      return material;
    });
    const geometry = document.geometry.map((g) => {
      const value = new T.BufferGeometry();
      value.setAttribute("position", new T.BufferAttribute(g.positions, 3));
      if (g.indices) value.setIndex(new T.BufferAttribute(g.indices, 1));
      if (g.normals)
        value.setAttribute("normal", new T.BufferAttribute(g.normals, 3));
      else if (g.kind === "mesh") value.computeVertexNormals();
      if (g.uvs) value.setAttribute("uv", new T.BufferAttribute(g.uvs, 2));
      if (g.colors)
        value.setAttribute("color", new T.BufferAttribute(g.colors, 3));
      for (const group of g.groups ?? [])
        value.addGroup(group.start, group.count, group.materialIndex);
      this.geometries.add(value);
      return value;
    });
    for (const node of document.nodes) {
      if (
        document.category === "drawing" &&
        node.geometryRef === undefined &&
        !["layer", "insert", "dimension"].includes(node.type)
      )
        continue;
      let object: T.Object3D;
      if (node.geometryRef !== undefined) {
        const ref = node.geometryRef,
          g = document.geometry[ref],
          colors = node.materialRefs.map((i) => mats[i]).filter(Boolean);
        let material = colors[0];
        if (!material) {
          material = new T.MeshStandardMaterial({
            color: 0x879aaa,
            side: T.DoubleSide,
            roughness: 0.7,
          });
          this.materials.add(material);
        }
        if (g.kind === "points") {
          const pm = new T.PointsMaterial({
            color: material.color,
            vertexColors: !!g.colors,
            size: this.scale / 500,
          });
          this.materials.add(pm);
          object = new T.Points(geometry[ref], pm);
        } else if (g.kind === "lines") {
          const lm = new T.LineBasicMaterial({ color: material.color });
          this.materials.add(lm);
          object = new T.LineSegments(geometry[ref], lm);
        } else {
          material.vertexColors = !!g.colors;
          object = new T.Mesh(
            geometry[ref],
            colors.length > 1 ? colors : material,
          );
        }
        if (g.origin) object.position.fromArray(g.origin);
      } else object = new T.Group();
      object.name = node.name;
      object.userData.nodeId = node.id;
      if (node.geometryRef !== undefined)
        object.userData.segmentOwners =
          document.geometry[node.geometryRef].segmentOwners;
      object.visible = node.visible;
      object.applyMatrix4(new T.Matrix4().fromArray(node.transform));
      this.objects.set(node.id, object);
    }
    for (const node of document.nodes) {
      const object = this.objects.get(node.id);
      if (!object) continue;
      const parent = node.parentId
        ? this.objects.get(node.parentId)
        : this.root;
      (parent ?? this.root).add(object);
    }
    this.grid = new T.GridHelper(this.scale * 2, 20, 0x667788, 0x667788);
    this.grid.visible = false;
    this.scene.add(this.grid);
    this.geometries.add(this.grid.geometry);
    for (const material of Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material])
      this.materials.add(material);
    this.renderer.domElement.addEventListener("pointerdown", this.down);
    this.renderer.domElement.addEventListener("pointerup", this.up);
    if ((document.labels?.length ?? 0) > 256) {
      document.diagnostics.push(
        "Drawing text preview limited to 256 labels; all text entities remain in Structure.",
      );
      document.reduced = true;
    }
    for (const label of (document.labels ?? []).slice(0, 256)) {
      const canvas = window.document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.font = "32px sans-serif";
      ctx.fillStyle = "#849aad";
      ctx.textBaseline = "top";
      ctx.fillText(label.text.slice(0, 200), 4, 4);
      const texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      this.textures.add(texture);
      const mat = new T.SpriteMaterial({
        rotation: label.rotation,
        map: texture,
        transparent: true,
        depthTest: false,
      });
      this.materials.add(mat);
      const sprite = new T.Sprite(mat);
      sprite.position.fromArray(label.position);
      sprite.scale.set(label.height * 4, label.height, 1);
      sprite.userData.nodeId = label.nodeId;
      this.objects.set(label.nodeId, sprite);
      const node = this.nodeMap.get(label.nodeId);
      let parent = node?.parentId ? this.objects.get(node.parentId) : undefined;
      if (!parent && node?.metadata.layer)
        parent = this.objects.get(
          this.document.nodes.find(
            (n) => n.type === "layer" && n.name === node.metadata.layer,
          )?.id ?? "",
        );
      (parent ?? this.root).add(sprite);
    }
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(element);
    window.document.addEventListener("visibilitychange", this.visibility);
    this.resizeCanvas();
    if (document.category === "drawing")
      this.camera.position.set(0, 0, this.scale * 2);
    this.fit();
    document.metadata.gpuInitMs=performance.now()-initStart;
  }
  private start?: [number, number];
  private down = (e: PointerEvent) => {
    this.start = [e.clientX, e.clientY];
  };
  private up = (e: PointerEvent) => {
    if (
      e.button !== 0 ||
      !this.start ||
      Math.hypot(e.clientX - this.start[0], e.clientY - this.start[1]) > 4
    )
      return;
    const bounds = this.renderer.domElement.getBoundingClientRect(),
      ray = new T.Raycaster();
    ray.params.Points.threshold = this.scale / 200;
    ray.params.Line.threshold = this.scale / 500;
    ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
        (-(e.clientY - bounds.top) / bounds.height) * 2 + 1,
      ),
      this.camera as T.PerspectiveCamera,
    );
    const hit = ray.intersectObjects(
      [...this.objects.values()].filter(
        (o) => (o as T.Mesh).geometry && this.visible(o),
      ),
      false,
    )[0];
    const owners = hit?.object.userData.segmentOwners as
      Uint32Array | undefined;
    const selected =
      owners && hit?.index !== undefined
        ? this.document.nodes[
            owners[
              Math.floor(
                ((hit.object as T.LineSegments).geometry.index?.getX(
                  hit.index,
                ) ?? hit.index) / 2,
              )
            ]
          ]?.id
        : hit?.object.userData.nodeId;
    this.pick(
      selected,
      hit ? (hit.point.add(this.center).toArray() as Vec3) : undefined,
    );
  };
  private visible(object: T.Object3D) {
    for (let p: T.Object3D | null = object; p; p = p.parent)
      if (!p.visible) return false;
    return true;
  }
  invalidate = () => {
    if (!this.alive || !this.active || this.contextLost || window.document.hidden || this.frame)
      return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.alive && this.active && !this.contextLost && !window.document.hidden) {
        this.renderer.render(this.scene, this.camera);
          this.renderer.domElement.dataset.renderStats = JSON.stringify({
            calls: this.renderer.info.render.calls,
            triangles: this.renderer.info.render.triangles,
            geometries: this.renderer.info.memory.geometries,
            textures: this.renderer.info.memory.textures,
            frame: this.renderer.info.render.frame,
            estimatedGeometryBytes: this.document.metadata.geometryBytes,
            estimatedTextureBytes: this.document.metadata.textureGpuBytes,
            parseMs: this.document.metadata.parseMs,
            gpuInitMs: this.document.metadata.gpuInitMs,
          });
      }
    });
  };
  private visibility = () => this.invalidate();
  setActive(value: boolean) {
    this.active = value;
    if (!value && this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    } else this.invalidate();
  }
  private resizeCanvas() {
    const width = Math.max(1, this.element.clientWidth),
      height = Math.max(1, this.element.clientHeight);
    if(width===this.viewportSize[0]&&height===this.viewportSize[1])return;
    this.viewportSize=[width,height];
    this.renderer.setSize(width, height);
    this.perspective.aspect = width / height;
    this.perspective.updateProjectionMatrix();
    this.orthographic.left = (-this.scale * width) / height;
    this.orthographic.right = (this.scale * width) / height;
    this.orthographic.top = this.scale;
    this.orthographic.bottom = -this.scale;
    this.orthographic.updateProjectionMatrix();
    this.invalidate();
  }
  fit(id?: string) {
    const target = id ? (this.objects.get(id) ?? this.root) : this.root;
    target.updateWorldMatrix(true, true);
    const box = new T.Box3().setFromObject(target);
    if (id && (!this.objects.has(id) || box.isEmpty())) {
      const metadata = this.document.nodes.find((n) => n.id === id)?.metadata
        .bounds as { min: Vec3; max: Vec3 } | undefined;
      if (metadata)
        box.set(
          new T.Vector3(...metadata.min).sub(this.center),
          new T.Vector3(...metadata.max).sub(this.center),
        );
    }
    const center = box.isEmpty()
        ? new T.Vector3()
        : box.getCenter(new T.Vector3()),
      size = box.isEmpty()
        ? this.scale
        : Math.max(box.getSize(new T.Vector3()).length(), 1e-9);
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    if (direction.lengthSq() < 0.5) direction.set(1, 1, 1).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, size * 1.6);
    this.perspective.near = Math.max(size / 10000, 1e-12);
    this.perspective.far = size * 100;
    this.perspective.updateProjectionMatrix();
    this.orthographic.near = Math.max(size / 10000, 1e-12);
    this.orthographic.far = size * 100;
    this.orthographic.zoom = this.scale / size;
    this.orthographic.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  }
  view(name: string) {
    const axes: Record<string, Vec3> = {
      front: [0, 0, 1],
      back: [0, 0, -1],
      left: [-1, 0, 0],
      right: [1, 0, 0],
      top: [0, 1, 0],
      bottom: [0, -1, 0],
      reset: [1, 1, 1],
    };
    const direction = new T.Vector3(...axes[name]);
    this.camera.up.set(0, 1, 0);
    if (name === "top" || name === "bottom") this.camera.up.set(0, 0, -1);
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(direction.normalize(), this.scale * 1.6);
    this.fit();
  }
  projection() {
    const position = this.camera.position.clone();
    this.camera =
      this.camera === this.perspective ? this.orthographic : this.perspective;
    this.camera.position.copy(position);
    this.controls.object = this.camera;
    this.fit();
    return this.camera === this.perspective ? "Perspective" : "Orthographic";
  }
  select(id?: string) {
    this.selected = id;
    if (this.highlight) {
      this.scene.remove(this.highlight);
      this.highlight.geometry.dispose();
      (this.highlight.material as T.Material).dispose();
      this.highlight = undefined;
    }
    const object = id ? this.objects.get(id) : undefined;
    if (object) {
      this.highlight = new T.BoxHelper(object, 0x87a4bd);
      this.scene.add(this.highlight);
    }
    if (id && !object) {
      const bounds = this.nodeMap.get(id)?.metadata.bounds as
        { min: Vec3; max: Vec3 } | undefined;
      if (bounds) {
        this.highlight = new T.Box3Helper(
          new T.Box3(
            new T.Vector3(...bounds.min).sub(this.center),
            new T.Vector3(...bounds.max).sub(this.center),
          ),
          0x87a4bd,
        );
        this.scene.add(this.highlight);
      }
    }
    this.invalidate();
  }
  private ownerVisible(id: string) {
    let node = this.nodeMap.get(id);
    const layer = this.layerIds.get(String(node?.metadata.layer));
    if (layer && this.hidden.has(layer)) return false;
    let depth = 0;
    while (node) {
      if (this.hidden.has(node.id)) return false;
      if (++depth > L.depth) return false;
      node = node.parentId ? this.nodeMap.get(node.parentId) : undefined;
    }
    return true;
  }
  private refreshDrawing() {
    if (this.document.category !== "drawing") return;
    for (const node of this.document.nodes) {
      if (node.geometryRef === undefined) continue;
      const g = this.document.geometry[node.geometryRef];
      if (!g.segmentOwners) continue;
      const indices: number[] = [];
      for (let i = 0; i < g.segmentOwners.length; i++) {
        const owner = this.document.nodes[g.segmentOwners[i]];
        if (this.ownerVisible(owner.id)) indices.push(i * 2, i * 2 + 1);
      }
      const mesh = this.objects.get(node.id) as T.LineSegments;
      if (mesh) {
        mesh.geometry.dispose();
        mesh.geometry.setIndex(indices);
        mesh.visible = indices.length > 0;
      }
    }
    for (const label of this.document.labels ?? []) {
      const object = this.objects.get(label.nodeId);
      if (object) object.visible = this.ownerVisible(label.nodeId);
    }
    this.invalidate();
  }
  hide(id: string) {
    this.hidden.add(id);
    const object = this.objects.get(id);
    if (object) object.visible = false;
    this.refreshDrawing();
    this.invalidate();
  }
  isolate(id: string) {
    if (this.document.category === "drawing") {
      const keep = new Set<string>(),
        queue = [id];
      for (let i = 0; i < queue.length; i++) {
        const n = this.nodeMap.get(queue[i]);
        if (!n) continue;
        keep.add(n.id);
        const layer = this.layerIds.get(String(n.metadata.layer));
        if (layer) keep.add(layer);
        queue.push(...n.children);
      }
      let parent = this.nodeMap.get(id);
      while (parent) {
        keep.add(parent.id);
        parent = parent.parentId
          ? this.nodeMap.get(parent.parentId)
          : undefined;
      }
      this.hidden = new Set(
        this.document.nodes
          .filter((n) => !keep.has(n.id) && !n.metadata.batch)
          .map((n) => n.id),
      );
      for (const object of this.objects.values()) object.visible = true;
      this.refreshDrawing();
      return;
    }
    const object = this.objects.get(id);
    if (!object) return;
    const keep = new Set<T.Object3D>();
    object.traverse((o) => keep.add(o));
    for (let parent: T.Object3D | null = object; parent; parent = parent.parent)
      keep.add(parent);
    for (const o of this.objects.values()) o.visible = keep.has(o);
    this.refreshDrawing();
    this.invalidate();
  }
  toggle(id: string) {
    if (this.hidden.has(id)) {
      this.hidden.delete(id);
      const object = this.objects.get(id);
      if (object) object.visible = true;
    } else {
      this.hidden.add(id);
      const object = this.objects.get(id);
      if (object) object.visible = false;
    }
    this.refreshDrawing();
    this.invalidate();
  }
  isHidden(id: string) {
    return this.hidden.has(id);
  }
  showAll() {
    this.hidden.clear();
    for (const o of this.objects.values()) o.visible = true;
    this.refreshDrawing();
    this.invalidate();
  }
  gridToggle() {
    this.grid.visible = !this.grid.visible;
    this.invalidate();
  }
  wireframe(value: boolean) {
    for (const material of this.materials)
      if (material instanceof T.MeshStandardMaterial)
        material.wireframe = value;
    this.invalidate();
  }
  measurement(points: Vec3[]) {
    if (this.measureLine) {
      this.scene.remove(this.measureLine);
      this.measureLine.geometry.dispose();
      (this.measureLine.material as T.Material).dispose();
      this.measureLine = undefined;
    }
    if (points.length === 2) {
      const g = new T.BufferGeometry().setFromPoints(
        points.map((p) => new T.Vector3(...p).sub(this.center)),
      );
      this.measureLine = new T.Line(
        g,
        new T.LineBasicMaterial({ color: 0x90b1d1, depthTest: false }),
      );
      this.scene.add(this.measureLine);
    }
    this.invalidate();
  }
  snapshot() {
    return {
      position: this.camera.position.toArray(),
      up: this.camera.up.toArray(),
      target: this.controls.target.toArray(),
      orthographic: this.camera === this.orthographic,
      zoom: (this.camera as T.OrthographicCamera).zoom,
      hidden: [
        ...new Set([
          ...this.hidden,
          ...[...this.objects.entries()]
            .filter(
              ([, o]) =>
                !o.visible &&
                !this.nodeMap.get(o.userData.nodeId)?.metadata.batch,
            )
            .map(([id]) => id),
        ]),
      ],
    };
  }
  restore(value: unknown) {
    if (!value || typeof value !== "object") return;
    const state = value as ReturnType<GeometryRenderEngine["snapshot"]>;
    if (
      !Array.isArray(state.position) ||
      !state.position.every(Number.isFinite) ||
      !Array.isArray(state.target) ||
      !state.target.every(Number.isFinite)
    )
      return;
    if (state.orthographic !== (this.camera === this.orthographic))
      this.projection();
    this.camera.position.fromArray(state.position);
    this.controls.target.fromArray(state.target);
    if (state.up) this.camera.up.fromArray(state.up);
    if (Number.isFinite(state.zoom)) {
      (this.camera as T.OrthographicCamera).zoom = state.zoom;
      (this.camera as T.PerspectiveCamera).updateProjectionMatrix();
    }
    this.hidden = new Set(state.hidden ?? []);
    for (const [id, object] of this.objects)
      object.visible =
        this.document.category === "drawing" || !this.hidden.has(id);
    this.refreshDrawing();
    this.controls.update();
    this.invalidate();
  }
  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.renderer.domElement.removeEventListener('webglcontextlost',this.lost);
    this.renderer.domElement.removeEventListener('webglcontextrestored',this.restored);
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    window.document.removeEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.removeEventListener("pointerdown", this.down);
    this.renderer.domElement.removeEventListener("pointerup", this.up);
    this.controls.dispose();
    this.select();
    this.measurement([]);
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.objects.clear();
    this.scene.clear();
  }
}

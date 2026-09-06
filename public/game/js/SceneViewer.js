// SceneViewer.js — 場景渲染元件
// -------------------------------------------------------------
// 讀取 scenes.json，依目前場景 ID：
//   1. 顯示對應背景圖（雙 <img> 疊層，切場景時淡入淡出、無感切換）
//   2. 依 hotspots 座標疊出透明可點擊區塊，點擊觸發 action
//   3. 依 exits 顯示方向箭頭，點擊切換到目的地場景
//
// 效能與流暢度處理：
//   - 兩張 <img> 疊在一起輪流當「當前圖」，切換時淡入下一張、淡出前一張。
//   - 換場景前先呼叫 img.decode() 讓瀏覽器在背景把 JPG 解碼完，避免顯示的
//     一瞬間才 decode 造成卡頓。
//   - 相鄰場景圖會事先預載（也用 decode()）進瀏覽器快取。
//   - frame 用 aspect-ratio 鎖住外框比例（1086/1448 = 3/4），切圖不會 reflow。
//
// hotspot 座標支援兩種寫法：
//   (A) 百分比：{ x, y, w, h }，皆為 0~1（相對整張圖）
//   (B) 像素矩形：{ rect: [x1, y1, x2, y2] }，用「圖片原始像素」座標
// -------------------------------------------------------------

const EXIT_META = {
  left:    { arrow: "←", pos: { left: "2%",  top: "50%", translate: "0, -50%" } },
  right:   { arrow: "→", pos: { right: "2%", top: "50%", translate: "0, -50%" } },
  forward: { arrow: "↑", pos: { left: "50%", top: "3%",  translate: "-50%, 0" } },
  up:      { arrow: "↑", pos: { left: "50%", top: "3%",  translate: "-50%, 0" } },
  back:    { arrow: "↓", pos: { left: "50%", bottom: "3%", translate: "-50%, 0" } },
  down:    { arrow: "↓", pos: { left: "50%", bottom: "3%", translate: "-50%, 0" } },
};

export class SceneViewer {
  static _preloaded = new Set();

  constructor(opts) {
    this.mount = opts.mount;
    this.scenes = opts.scenes || {};
    this.imageBase = opts.imageBase ?? "assets/";
    this.devMode = !!opts.devMode;
    this.onAction = opts.onAction || (() => {});
    this.onSceneChange = opts.onSceneChange || (() => {});
    this.current = null;
    this._pixelHotspots = [];
    this._renderToken = 0; // 用來取消已被更新場景蓋掉的舊 async render

    this.mount.classList.add("sv-root");
    this.mount.innerHTML = `
      <div class="sv-frame">
        <img class="sv-image sv-image-a" alt="scene">
        <img class="sv-image sv-image-b" alt="scene">
        <div class="sv-overlay"></div>
      </div>`;
    this.frame = this.mount.querySelector(".sv-frame");
    this.imgA = this.mount.querySelector(".sv-image-a");
    this.imgB = this.mount.querySelector(".sv-image-b");
    this.overlay = this.mount.querySelector(".sv-overlay");
    this._activeImg = this.imgA;   // 目前顯示中的圖
    this.imgEl = this.imgA;         // 對外相容：外部若讀 this.imgEl，指向當前顯示圖

    // 兩張圖都要監聽 error，只有當前顯示的圖出事才顯示佔位
    [this.imgA, this.imgB].forEach((img) => {
      img.addEventListener("error", () => {
        if (img === this._activeImg) this.frame.classList.add("sv-broken");
      });
    });

    // 預先預載所有場景圖（背景執行、不擋開場）
    this._preloadAll();

    if (opts.startScene) this.goto(opts.startScene);
  }

  goto(sceneId) {
    if (!this.scenes[sceneId]) {
      console.error(`[SceneViewer] 找不到場景：「${sceneId}」`);
      return;
    }
    this.current = sceneId;
    this.render();
    this.onSceneChange(sceneId);
  }

  setDevMode(on) {
    this.devMode = !!on;
    this.frame.classList.toggle("sv-dev", this.devMode);
  }

  async render() {
    const scene = this.scenes[this.current];
    if (!scene) return;
    const token = ++this._renderToken;

    // overlay（hotspots + exits）先重建：即使圖還在 decode，玩家已可看到互動點
    this.frame.classList.toggle("sv-dev", this.devMode);
    this.overlay.innerHTML = "";
    this._pixelHotspots = [];

    this._buildHotspots(scene);
    this._buildExits(scene);

    // 決定下一張要顯示到哪個 img slot（跟目前不同的那張）
    const next = this._activeImg === this.imgA ? this.imgB : this.imgA;
    // 自動找出實際存在的副檔名（.jpg/.png/.webp）；使用者放的檔名跟 scenes.json
    // 寫的副檔名不一致也 OK，用哪個都會被找到。
    const image = await this._resolveImage(scene);
    if (token !== this._renderToken) return;
    const url = this.imageBase + image;
    const absUrl = new URL(url, location.href).href;
    next.alt = "（尚未提供圖片：" + scene.image + "）";

    if (next.src !== absUrl) next.src = url;

    // 等圖片載好。用 load 事件而非 img.decode()，因為連續換 src 時
    // decode() 的舊 promise 有時永遠不 resolve（Chromium 已知行為），會卡住。
    try {
      if (!(next.complete && next.naturalWidth)) {
        await new Promise((resolve, reject) => {
          next.addEventListener("load", resolve, { once: true });
          next.addEventListener("error", reject, { once: true });
        });
      }
    } catch {
      if (token === this._renderToken) this.frame.classList.add("sv-broken");
      return;
    }
    if (token !== this._renderToken) return; // 已切到別的場景，放棄這個 render

    // 切換：新的加 .on（z-index:1、opacity:1），舊的移除 .on 淡出
    next.classList.add("on");
    if (this._activeImg && this._activeImg !== next) this._activeImg.classList.remove("on");
    this._activeImg = next;
    this.imgEl = next;
    this.frame.classList.remove("sv-broken");

    // 圖已就緒 → 依這張圖的原始尺寸把像素 hotspot 定位
    this._layoutPixelHotspots();

    // 預先把「這個場景能走到的下一個場景圖」放進瀏覽器快取（並 decode）
    this._preloadNeighbors(scene);
  }

  _buildHotspots(scene) {
    (scene.hotspots || []).forEach((h) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "sv-hotspot";
      el.dataset.id = h.id;
      el.innerHTML = `<span class="sv-hotspot-label">${h.id}</span>`;

      if (Array.isArray(h.rect)) {
        this._pixelHotspots.push({ el, rect: h.rect });
      } else {
        el.style.left = h.x * 100 + "%";
        el.style.top = h.y * 100 + "%";
        el.style.width = h.w * 100 + "%";
        el.style.height = h.h * 100 + "%";
      }

      el.addEventListener("click", () => {
        if (h.action) {
          this.onAction({ action: h.action, hotspot: h, sceneId: this.current, viewer: this });
        } else if (h.goto) {
          this.goto(h.goto);
        } else {
          console.warn(`[SceneViewer] hotspot「${h.id}」沒有 action 也沒有 goto，點了不會有反應`);
        }
      });
      this.overlay.appendChild(el);
    });
  }

  _buildExits(scene) {
    Object.entries(scene.exits || {}).forEach(([dir, targetId]) => {
      const meta = EXIT_META[dir];
      const el = document.createElement("button");
      el.type = "button";
      el.className = "sv-exit";
      el.dataset.dir = dir;
      el.textContent = meta ? meta.arrow : dir;
      el.dataset.target = targetId;

      const p = meta ? meta.pos : { left: "50%", bottom: "3%", translate: "-50%, 0" };
      if (p.left)   el.style.left = p.left;
      if (p.right)  el.style.right = p.right;
      if (p.top)    el.style.top = p.top;
      if (p.bottom) el.style.bottom = p.bottom;
      el.style.transform = `translate(${p.translate})`;

      el.addEventListener("click", () => this.goto(targetId));
      this.overlay.appendChild(el);
    });
  }

  // 預先下載＋解碼相鄰場景圖
  _preloadNeighbors(scene) {
    const neighbors = new Set();
    (scene.hotspots || []).forEach((h) => { if (h.goto) neighbors.add(h.goto); });
    Object.values(scene.exits || {}).forEach((id) => neighbors.add(id));
    neighbors.forEach((id) => this._preload(id));
  }

  // 一次把整個地圖所有場景圖都預載（背景執行、失敗靜默）
  _preloadAll() {
    Object.keys(this.scenes).forEach((id) => this._preload(id));
  }

  async _preload(sceneId) {
    const s = this.scenes[sceneId];
    if (!s || !s.image) return;
    // 先解析出實際存在的副檔名，順便預先下載＋解碼
    const image = await this._resolveImage(s);
    const url = this.imageBase + image;
    if (SceneViewer._preloaded.has(url)) return;
    SceneViewer._preloaded.add(url);
    const img = new Image();
    img.src = url;
    if (img.decode) img.decode().catch(() => {});
  }

  // 找出 scene.image 對應的實際檔案：依序試 scene.image 本身、然後常見副檔名
  // (jpg/png/webp)。第一個能載入的就記在 scene._resolvedImage，之後直接用。
  async _resolveImage(scene) {
    if (scene._resolvedImage) return scene._resolvedImage;
    if (scene._resolvingPromise) return scene._resolvingPromise;

    const candidates = this._imageCandidates(scene.image);
    scene._resolvingPromise = (async () => {
      for (const name of candidates) {
        const ok = await this._probeImage(this.imageBase + name);
        if (ok) { scene._resolvedImage = name; return name; }
      }
      // 全部載不到 → 用原本寫的（讓錯誤照舊觸發 sv-broken）
      scene._resolvedImage = scene.image;
      return scene.image;
    })();
    return scene._resolvingPromise;
  }

  _imageCandidates(imageField) {
    const base = imageField.replace(/\.(jpe?g|png|webp|gif)$/i, "");
    const list = [imageField, base + ".jpg", base + ".png", base + ".webp"];
    // 去重、維持順序
    return list.filter((v, i) => list.indexOf(v) === i);
  }

  _probeImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  _layoutPixelHotspots() {
    const nw = this._activeImg.naturalWidth, nh = this._activeImg.naturalHeight;
    if (!nw || !nh) return;
    this._pixelHotspots.forEach(({ el, rect }) => {
      const [a, b, c, d] = rect;
      const left = Math.min(a, c), top = Math.min(b, d);
      const right = Math.max(a, c), bottom = Math.max(b, d);
      el.style.left = (left / nw) * 100 + "%";
      el.style.top = (top / nh) * 100 + "%";
      el.style.width = ((right - left) / nw) * 100 + "%";
      el.style.height = ((bottom - top) / nh) * 100 + "%";
    });
  }
}

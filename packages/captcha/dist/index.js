var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/index.ts
var lib_exports = {};
__export(lib_exports, {
  Jigsaw: () => Jigsaw
});
module.exports = __toCommonJS(lib_exports);

// lib/Bar.ts
var Bar = class {
  width;
  height;
  successColor = "#f7f9fa";
  bar;
  text;
  mask;
  slider;
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.createBar();
    this.createMask();
    this.createSlider();
    this.createText();
  }
  get elmBar() {
    return this.bar;
  }
  get elmSlider() {
    return this.slider;
  }
  get elmMask() {
    return this.mask;
  }
  createBar() {
    const bar = document.createElement("div");
    bar.style.width = `${this.width}px`;
    bar.style.height = `${this.height}px`;
    bar.style.textAlign = "center";
    bar.style.lineHeight = bar.style.height;
    bar.style.backgroundColor = this.successColor;
    bar.style.border = "1px solid #e4e7eb";
    bar.style.position = "relative";
    bar.style.userSelect = "none";
    bar.style.overflow = "hidden";
    this.bar = bar;
  }
  createText() {
    const text = document.createElement("span");
    text.innerText = "\u5411\u53F3\u6ED1\u52A8\u586B\u5145\u62FC\u56FE";
    this.text = text;
  }
  createMask() {
    const mask = document.createElement("div");
    mask.style.height = "100%";
    mask.style.width = "100%";
    mask.style.position = "absolute";
    mask.style.top = "0";
    mask.style.left = "-100%";
    mask.style.backgroundColor = "#67C23A";
    this.mask = mask;
  }
  createSlider() {
    const slider = document.createElement("div");
    slider.style.width = "40px";
    slider.style.height = this.bar.style.height;
    slider.style.boxShadow = "0 0 3px rgba(0, 0, 0, 0.3)";
    slider.style.backgroundColor = "#fff";
    slider.style.position = "absolute";
    slider.style.top = "0";
    slider.style.left = "0";
    this.slider = slider;
  }
  render(elm) {
    this.bar.appendChild(this.text);
    this.bar.appendChild(this.slider);
    this.bar.appendChild(this.mask);
    elm.appendChild(this.bar);
  }
};

// lib/index.ts
var Jigsaw = class {
  wrapper;
  backgroundImgUrl;
  blockImgUrl;
  onFinish;
  width;
  height;
  bar;
  startPos;
  blockImg;
  constructor(options) {
    const { background, block, onFinish, width = 310, height = 155 } = options;
    this.width = width;
    this.height = height;
    this.backgroundImgUrl = background;
    this.blockImgUrl = block;
    this.onFinish = onFinish;
    this.bar = new Bar(this.width, 40);
    this.bar.elmBar.addEventListener("mousedown", this.onDragStart);
  }
  async createWrapper() {
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    const backgroundImg = await this.loadImage(this.backgroundImgUrl);
    const blockImg = await this.loadImage(this.blockImgUrl);
    blockImg.style.position = "absolute";
    blockImg.style.top = "0";
    blockImg.style.left = "0";
    this.blockImg = blockImg;
    wrapper.appendChild(backgroundImg);
    wrapper.appendChild(blockImg);
    this.wrapper = wrapper;
  }
  async render(elm) {
    let node;
    if (typeof elm === "string") {
      node = document.querySelector(elm);
    } else {
      node = elm;
    }
    if (!node) {
      throw new Error(`[captcha] cannot find element ${elm}`);
    }
    await this.createWrapper();
    node.appendChild(this.wrapper);
    this.bar.render(node);
  }
  loadImage(url) {
    const image = new Image();
    image.src = url;
    return new Promise((resolve, reject) => {
      image.onload = () => {
        resolve(image);
      };
      image.onerror = reject;
    });
  }
  onDragStart(evt) {
    this.startPos = { x: evt.clientX, y: evt.clientY };
    console.log("add");
    document.addEventListener("mousemove", this.onDragMove);
    document.addEventListener("mouseup", this.onDragEnd);
  }
  onDragMove(evt) {
    console.log("mvoe");
    const len = this.width - this.width;
    const wrapLen = this.width - parseFloat(this.bar.elmSlider.style.width);
    const x = Math.min(Math.max(evt.clientX - this.startPos.x, 0), wrapLen);
    const per = x / wrapLen;
    this.blockImg.style.transform = `translateX(${len * per}px)`;
    this.bar.elmSlider.style.transform = `translateX(${x}px)`;
    this.bar.elmMask.style.transform = `translateX(${x}px)`;
  }
  onDragEnd() {
    console.log("remove");
    document.removeEventListener("mousemove", this.onDragMove);
    document.removeEventListener("mouseup", this.onDragEnd);
    this.blockImg.style.transform.replace(/(\d*.?\d*)px/, (all, $1) => {
      const offset = $1;
      this.onFinish(offset);
      return all;
    });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Jigsaw
});

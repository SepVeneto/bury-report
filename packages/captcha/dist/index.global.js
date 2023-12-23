(() => {
  // lib/index.ts
  var canvas = document.createElement("canvas");
  var block = document.createElement("canvas");
  var R = 9;
  var L = 42;
  canvas.width = 310;
  canvas.height = 155;
  block.width = canvas.width;
  block.height = canvas.height;
  var ctx = canvas.getContext("2d");
  var blockCtx = block.getContext("2d");
  if (!ctx)
    throw new Error("Can not create ctx");
  if (!blockCtx)
    throw new Error("Can not create block");
  var image = new Image(canvas.width, canvas.height);
  image.src = "./976-310x155.jpg";
  image.onload = () => {
    const x = 150;
    const y = 50;
    drawSlot(ctx, x, y);
    ctx.fill();
    drawSlot(blockCtx, x, y);
    blockCtx.clip();
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    blockCtx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = blockCtx.getImageData(x, 0, L + L / 2, block.height);
    block.width = L + L / 2;
    blockCtx.putImageData(imageData, 0, 0);
  };
  var wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  block.style.position = "absolute";
  block.style.top = "0";
  block.style.left = "0";
  wrapper.appendChild(canvas);
  wrapper.appendChild(block);
  document.body.appendChild(wrapper);
  renderBar();
  function drawSlot(ctx2, x, y) {
    ctx2.beginPath();
    ctx2.moveTo(x, y);
    ctx2.arc(x + L / 2, y - R + 2, R, 0.72 * Math.PI, 2.26 * Math.PI);
    ctx2.lineTo(x + L, y);
    ctx2.arc(x + L + R - 2, y + L / 2, R, 1.21 * Math.PI, 2.78 * Math.PI);
    ctx2.lineTo(x + L, y + L);
    ctx2.lineTo(x, y + L);
    ctx2.arc(x + R - 2, y + L / 2, R + 0.4, 2.76 * Math.PI, 1.24 * Math.PI, true);
    ctx2.lineTo(x, y);
    ctx2.lineWidth = 2;
    const color = "rgba(255,255,255,0.7)";
    ctx2.fillStyle = color;
    ctx2.strokeStyle = color;
    ctx2.stroke();
    ctx2.globalCompositeOperation = "destination-over";
  }
  var slider;
  var mask;
  function renderBar() {
    const bar = document.createElement("div");
    bar.style.width = `${canvas.width}px`;
    bar.style.height = "40px";
    bar.style.textAlign = "center";
    bar.style.lineHeight = bar.style.height;
    bar.style.backgroundColor = "#f7f9fa";
    bar.style.border = "1px solid #e4e7eb";
    bar.style.position = "relative";
    bar.style.userSelect = "none";
    bar.style.overflow = "hidden";
    const text = document.createElement("span");
    text.innerText = "\u5411\u53F3\u6ED1\u52A8\u586B\u5145\u62FC\u56FE";
    mask = document.createElement("div");
    mask.style.height = "100%";
    mask.style.width = "100%";
    mask.style.position = "absolute";
    mask.style.top = "0";
    mask.style.left = "-100%";
    mask.style.backgroundColor = "#67C23A";
    slider = document.createElement("div");
    slider.style.width = "40px";
    slider.style.height = bar.style.height;
    slider.style.boxShadow = "0 0 3px rgba(0, 0, 0, 0.3)";
    slider.style.backgroundColor = "#fff";
    slider.style.position = "absolute";
    slider.style.top = "0";
    slider.style.left = "0";
    bar.appendChild(text);
    bar.appendChild(slider);
    bar.appendChild(mask);
    document.body.appendChild(bar);
    bar.addEventListener("mousedown", onDragStart);
  }
  var start = { x: 0, y: 0 };
  function onDragStart(evt) {
    start = { x: evt.clientX, y: evt.clientY };
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
  }
  function onDragMove(evt) {
    const len = canvas.width - block.width;
    const wrapLen = canvas.width - parseFloat(slider.style.width);
    const x = Math.min(Math.max(evt.clientX - start.x, 0), wrapLen);
    const per = x / wrapLen;
    block.style.transform = `translateX(${len * per}px)`;
    slider.style.transform = `translateX(${x}px)`;
    mask.style.transform = `translateX(${x}px)`;
  }
  function onDragEnd(evt) {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
  }
})();

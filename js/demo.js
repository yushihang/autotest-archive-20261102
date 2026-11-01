/* ==========================================================================
   链上小课堂 — 互动演示
   点「添加区块」把新区块接到链上；改一改某个区块的内容，
   它的指纹就会变，后面所有区块跟着报警。

   指纹用纯 JavaScript 算（file:// 下 Web Crypto 不可用），
   只是「简化版指纹」，真链用的是 SHA-256 这类密码学哈希。
   ========================================================================== */
(function () {
  "use strict";

  var root = document.getElementById("demo-root");
  if (!root) {
    return;
  }

  /* 创世区块没有「前一块」，约定一串 0 当地基。 */
  var GENESIS_PREV = "0000000000000000";
  var MAX_BLOCKS = 12;

  var SUGGESTIONS = [
    "小明借给小红 5 个积木",
    "小红还回来 2 个积木",
    "老师奖励全班 10 颗星星",
    "小新用 3 枚贴纸换了一本书",
    "妈妈给弟弟 1 块蛋糕"
  ];

  var state = {
    blocks: [],
    nextIndex: 0,
    suggestion: 0,
    reducedMotion: Boolean(
      window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  };

  /* 1. 简化版指纹
     ====================================================================== */

  /* FNV-1a：把一串字符揉成一个 32 位数字。 */
  function fnv1a(text, seed) {
    var hash = seed >>> 0;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  /* 用两个不同的种子各揉一次，拼成 16 位十六进制指纹。
     内容、序号、前一块指纹任何一处变了，指纹都会面目全非。 */
  function fingerprint(index, data, prevHash) {
    var payload = String(index) + "|" + String(data) + "|" + String(prevHash);
    return (
      fnv1a(payload, 0x811c9dc5).toString(16).padStart(8, "0") +
      fnv1a(payload + "#2", 0x9e3779b9).toString(16).padStart(8, "0")
    );
  }

  /* 2. 小工具
     ====================================================================== */

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function nextSuggestion() {
    var value = SUGGESTIONS[state.suggestion % SUGGESTIONS.length];
    state.suggestion += 1;
    return value;
  }

  /* 3. 搭界面骨架
     ====================================================================== */

  var shell = make("div", "chain-demo");

  var toolbar = make("div", "chain-demo__toolbar");

  var field = make("label", "chain-demo__field");
  field.htmlFor = "chain-demo-entry";
  var fieldLabel = make("span", "chain-demo__field-label", "下一个区块记什么？");
  var entry = make("input", "chain-demo__input");
  entry.type = "text";
  entry.id = "chain-demo-entry";
  entry.maxLength = 30;
  entry.autocomplete = "off";
  entry.setAttribute("aria-describedby", "chain-demo-hint");
  field.append(fieldLabel, entry);

  var actions = make("div", "chain-demo__actions");
  var addBtn = make("button", "chain-demo__btn chain-demo__btn--add", "＋ 添加区块");
  addBtn.type = "button";
  var resetBtn = make("button", "chain-demo__btn chain-demo__btn--reset", "重新开始");
  resetBtn.type = "button";
  actions.append(addBtn, resetBtn);

  toolbar.append(field, actions);

  var status = make("p", "chain-demo__status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  var list = make("ol", "chain-demo__list");

  var note = make("p", "chain-demo__note");
  note.id = "chain-demo-hint";
  note.append(
    make("strong", "", "小提示："),
    document.createTextNode(
      "这里的「指纹」是简化版，只用一个很小的 JavaScript 算式算出来，方便直接打开网页就能玩。" +
        "真正的区块链用 SHA-256 这样的密码学哈希，而且由很多台电脑一起记账——" +
        "谁偷偷改一个数字，别人一算指纹就能发现。"
    )
  );

  shell.append(toolbar, status, list, note);
  root.replaceChildren(shell);

  /* 4. 渲染区块
     ====================================================================== */

  function makePrint(label) {
    var row = make("div", "chain-demo__print");
    var term = make("dt", "", label);
    var value = make("dd", "");
    var code = make("code", "chain-demo__code");
    value.append(code);
    row.append(term, value);
    return { row: row, code: code };
  }

  function buildCard(block) {
    var item = make("li", "chain-demo__item");
    var connector = null;

    if (block.index > 0) {
      connector = make("div", "chain-demo__connector");
      connector.setAttribute("aria-hidden", "true");
      item.append(connector);
    }

    var card = make("article", "chain-demo__block");

    var head = make("header", "chain-demo__block-head");
    var badge = make("span", "chain-demo__block-index", "#" + block.index);
    var title = make(
      "h3",
      "chain-demo__block-title",
      block.index === 0 ? "创世区块" : "区块 " + block.index
    );
    var flag = make("span", "chain-demo__block-flag", "完好");
    head.append(badge, title, flag);

    var dataField = make("label", "chain-demo__block-field");
    var dataLabel = make(
      "span",
      "chain-demo__block-label",
      "记录的内容（可以改改看）"
    );
    var dataInput = make("input", "chain-demo__block-data");
    dataInput.type = "text";
    dataInput.maxLength = 40;
    dataInput.autocomplete = "off";
    dataInput.value = block.data;
    dataInput.setAttribute(
      "aria-label",
      "区块 " + block.index + " 记录的内容"
    );
    dataInput.setAttribute("aria-describedby", "chain-demo-hint");
    dataField.append(dataLabel, dataInput);

    var prints = make("dl", "chain-demo__prints");
    var own = makePrint("本块指纹");
    var prev = makePrint("前一块指纹");
    own.code.classList.add("chain-demo__code--own");
    prints.append(own.row, prev.row);

    var alarm = make("p", "chain-demo__block-alarm");
    alarm.hidden = true;

    card.append(head, dataField, prints, alarm);
    item.append(card);

    block.el = {
      item: item,
      connector: connector,
      card: card,
      flag: flag,
      ownCode: own.code,
      prevCode: prev.code,
      alarm: alarm
    };

    dataInput.addEventListener("input", function () {
      block.data = dataInput.value;
      refresh();
    });

    return item;
  }

  function mount(block) {
    list.append(buildCard(block));
  }

  /* 5. 检查链条
     ====================================================================== */

  function evaluate() {
    var rows = [];
    var firstBad = -1;

    for (var i = 0; i < state.blocks.length; i += 1) {
      var block = state.blocks[i];
      var hash = fingerprint(block.index, block.data, block.prevHash);
      var ownOk = hash === block.sealed;
      var linkOk =
        i === 0
          ? block.prevHash === GENESIS_PREV
          : block.prevHash === rows[i - 1].hash;

      rows.push({ hash: hash, ownOk: ownOk, linkOk: linkOk });

      if (firstBad === -1 && !(ownOk && linkOk)) {
        firstBad = i;
      }
    }

    return { rows: rows, firstBad: firstBad };
  }

  function fillAlarm(node, block, row) {
    node.replaceChildren();
    node.append(document.createTextNode("⚠ "));

    if (!row.ownOk) {
      node.append(
        document.createTextNode("记账时记下的指纹是 "),
        make("code", "chain-demo__code chain-demo__code--old", block.sealed),
        document.createTextNode("，现在算出来是 "),
        make("code", "chain-demo__code", row.hash),
        document.createTextNode("。内容变了，指纹就全变了。")
      );
    } else {
      node.append(
        document.createTextNode(
          "前一块的指纹对不上——它前面那一块被改过，这条链在这里断了。"
        )
      );
    }
  }

  function updateStatus(result) {
    var firstBad = result.firstBad;

    status.classList.toggle("is-ok", firstBad === -1);
    status.classList.toggle("is-bad", firstBad !== -1);

    if (firstBad === -1) {
      status.textContent =
        "✅ 链条完好：每个区块都记着前一块的指纹。点「添加区块」继续往下接。";
      return;
    }

    var block = state.blocks[firstBad];
    var row = result.rows[firstBad];
    var reason = !row.ownOk
      ? "区块 #" + block.index + " 的内容被改了，它的指纹跟着变"
      : "区块 #" + block.index + " 和前一块对不上";

    status.textContent =
      "⚠️ 篡改会被发现！" +
      reason +
      "，从它开始后面的区块全都对不上。把内容改回去，链就会自动修好。";
  }

  function refresh() {
    var result = evaluate();

    for (var i = 0; i < state.blocks.length; i += 1) {
      var block = state.blocks[i];
      var row = result.rows[i];
      var broken = result.firstBad !== -1 && i >= result.firstBad;

      block.el.card.classList.toggle("is-alarm", broken);
      block.el.flag.textContent = broken ? "警报" : "完好";
      block.el.ownCode.textContent = row.hash;
      block.el.prevCode.textContent = block.prevHash;

      if (broken) {
        fillAlarm(block.el.alarm, block, row);
      }
      block.el.alarm.hidden = !broken;

      if (block.el.connector) {
        block.el.connector.classList.toggle(
          "is-alarm",
          result.firstBad !== -1 && i - 1 >= result.firstBad
        );
      }
    }

    updateStatus(result);
  }

  /* 6. 增删区块
     ====================================================================== */

  function appendBlock(data) {
    var last = state.blocks[state.blocks.length - 1];
    /* 新区块记住的是前一块「记账时写下的指纹」，
       所以把被改的内容改回去，链就会自己接上。 */
    var prevHash = last ? last.sealed : GENESIS_PREV;
    var block = {
      index: state.nextIndex,
      data: data,
      prevHash: prevHash,
      sealed: ""
    };

    block.sealed = fingerprint(block.index, block.data, block.prevHash);
    state.nextIndex += 1;
    state.blocks.push(block);
    mount(block);
    refresh();
    updateAddButton();

    return block;
  }

  function updateAddButton() {
    var full = state.blocks.length >= MAX_BLOCKS;
    addBtn.disabled = full;
    addBtn.textContent = full ? "区块够多了" : "＋ 添加区块";
  }

  function addBlock() {
    if (state.blocks.length >= MAX_BLOCKS) {
      return;
    }

    var data = entry.value.trim() || SUGGESTIONS[0];
    appendBlock(data);
    entry.value = nextSuggestion();

    var latest = state.blocks[state.blocks.length - 1];
    if (
      latest.el &&
      !state.reducedMotion &&
      typeof latest.el.card.scrollIntoView === "function"
    ) {
      latest.el.card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    entry.focus();
  }

  function reset() {
    state.blocks = [];
    state.nextIndex = 0;
    state.suggestion = 0;
    list.replaceChildren();

    appendBlock("链的起点：创世区块");
    appendBlock(nextSuggestion());
    entry.value = nextSuggestion();
    updateAddButton();
  }

  /* 7. 事件绑定
     ====================================================================== */

  addBtn.addEventListener("click", addBlock);

  resetBtn.addEventListener("click", function () {
    reset();
    entry.focus();
  });

  entry.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      addBlock();
    }
  });

  reset();
})();

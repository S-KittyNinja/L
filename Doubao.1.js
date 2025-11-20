// ==UserScript==
// @name         Doubao 问题书签 — Purple Glass Edition (doubao.com/chat)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  豆包聊天页面（https://www.doubao.com/chat/*）的紫色毛玻璃书签：折叠小方块、搜索+刷新同一行、可拖动、点击跳转、高亮、脚本刷新（不刷新网页）
// @match        https://www.doubao.com/chat/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    /**********************
     * 配置 & 状态
     **********************/
    const recorded = new Set(); // 保存 message-id 已记录
    let observer = null;
    let isCollapsed = true;

    // 选择器（根据你给的示例）
    const MESSAGE_SELECTOR = 'div[data-testid="message_content"][data-message-id]';
    const TEXT_INSIDE_SELECTOR = '[data-testid="message_text_content"]';

    /**********************
     * 工具函数
     **********************/
    const $ = (q) => document.querySelector(q);
    const $all = (q) => Array.from(document.querySelectorAll(q));

    // 自动适配文字颜色（给亮/暗背景挑合适文字色）
    function readableTextColor(bgRgba) {
        // bgRgba 形如 rgba(r,g,b,a)
        try {
            const nums = bgRgba.match(/[\d.]+/g).slice(0, 3).map(Number);
            const [r, g, b] = nums;
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return lum > 0.6 ? "#222" : "#fff";
        } catch (e) {
            return "#fff";
        }
    }

    /**********************
     * UI：小方块 + 面板（紫色毛玻璃）
     **********************/
    const cube = document.createElement("div");
    Object.assign(cube.style, {
        position: "fixed",
        top: "50px",
        right: "18px",
        width: "42px",
        height: "42px",
        background: "rgba(160,120,255,0.28)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.45)",
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: "20px",
        color: "#fff",
        zIndex: 9999999999,
        boxShadow: "0 6px 22px rgba(80,0,140,0.30)",
        transition: "all 0.18s ease",
    });
    cube.textContent = "📌";
    document.body.appendChild(cube);

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "fixed",
        top: "78px",
        right: "28px",
        width: "320px",
        maxHeight: "72vh",
        overflowY: "auto",
        padding: "14px",
        borderRadius: "16px",
        backdropFilter: "blur(20px)",
        background: "rgba(160,120,255,0.22)", // 淡紫玻璃
        border: "1px solid rgba(255,255,255,0.40)",
        boxShadow: "0 8px 28px rgba(80,0,140,0.18)",
        zIndex: 999999999,
        color: "#fff",
        display: "none", // 初始折叠
    });
    panel.innerHTML = `
        <div style="font-weight:700;font-size:15px;margin-bottom:10px;color:#fff;">📑 豆包问题书签</div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <input id="db_searchBox" type="text" placeholder="搜索…"
                style="flex:1;padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.30);background:rgba(255,255,255,0.12);color:#fff;outline:none;">
            <button id="db_refreshBtn" title="刷新脚本"
                style="width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,0.32);background:rgba(255,255,255,0.14);color:#fff;cursor:pointer;font-size:17px;">🔄</button>
        </div>

        <div id="db_bookmarkList" style="display:flex;flex-direction:column;gap:8px;"></div>
    `;
    document.body.appendChild(panel);

    const searchBox = document.getElementById("db_searchBox");
    const refreshBtn = document.getElementById("db_refreshBtn");
    const bookmarkList = document.getElementById("db_bookmarkList");

    /**********************
     * 折叠/展开 & 拖动
     **********************/
    cube.addEventListener("click", () => {
        isCollapsed = !isCollapsed;
        panel.style.display = isCollapsed ? "none" : "block";
        cube.style.transform = isCollapsed ? "scale(1)" : "rotate(45deg)";
    });

    // 拖动面板（拖动区域为 panel 本身，忽略 input/button）
    let dragging = false, dx = 0, dy = 0;
    panel.addEventListener("mousedown", (e) => {
        if (["INPUT", "BUTTON"].includes(e.target.tagName)) return;
        dragging = true;
        dx = e.clientX - panel.offsetLeft;
        dy = e.clientY - panel.offsetTop;
        panel.style.transition = "none";
    });
    document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        panel.style.left = (e.clientX - dx) + "px";
        panel.style.top = (e.clientY - dy) + "px";
    });
    document.addEventListener("mouseup", () => {
        dragging = false;
        panel.style.transition = "";
    });

    /**********************
     * 解析消息并添加书签
     *
     * 豆包页面示例结构（你给的）：
     * <div data-testid="message_content" data-message-id="3001..." class="... justify-end">  <-- outer
     *   <div class="max-w-full" data-plugin-identifier="...">
     *     <div data-testid="message_text_content" class="...">消息文本</div>
     *   </div>
     * </div>
     **********************/
    function isUserMessage(msgEl) {
        // 优先通过 class 包含 'justify-end'（你示例里用户消息是右对齐）
        try {
            const cls = msgEl.className || "";
            if (typeof cls === "string" && cls.includes("justify-end")) return true;
        } catch (e) { /* ignore */ }

        // 兜底：如果 message element is at right side (style) or other heuristics
        // 若不能确定，仍允许记录（因为 data-message-id 唯一），但为安全起见我们优先 require justify-end
        return false;
    }

    function getMessageText(msgEl) {
        const inner = msgEl.querySelector(TEXT_INSIDE_SELECTOR);
        if (inner) return inner.innerText.trim();
        // 兜底：取 msgEl 的 innerText，但可能包含作者/时间等
        return msgEl.innerText.trim();
    }

    function makeBookmarkNode(msgEl, text) {
        const id = msgEl.getAttribute("data-message-id") || Math.random().toString(36).slice(2, 9);

        const card = document.createElement("div");
        Object.assign(card.style, {
            padding: "8px 10px",
            borderRadius: "10px",
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.12)",
            cursor: "pointer",
            color: "#fff",
            backdropFilter: "blur(6px)",
        });

        const title = document.createElement("div");
        title.innerText = text.length > 40 ? (text.slice(0, 40) + "...") : text;
        Object.assign(title.style, {
            fontWeight: "600",
            color: "#f0d0ff", // 强调色
            marginBottom: "6px",
            lineHeight: "1.3",
        });

        const detail = document.createElement("div");
        detail.innerText = text;
        Object.assign(detail.style, {
            display: "none",
            fontSize: "13px",
            color: "#ffeefe",
            marginTop: "4px",
            whiteSpace: "pre-wrap"
        });

        // 点击卡片 => 展开/收起并滚动到原消息（直接跳转）
        card.addEventListener("click", (e) => {
            // expand/collapse
            detail.style.display = detail.style.display === "none" ? "block" : "none";

            // jump to origin
            try {
                msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
                const prev = msgEl.style.outline;
                msgEl.style.outline = "3px solid #ffb8ff";
                setTimeout(() => msgEl.style.outline = prev || "", 1400);
            } catch (err) {
                console.warn("跳转失败", err);
            }
        });

        card.appendChild(title);
        card.appendChild(detail);
        return card;
    }

    // 轻防抖
    let scanTimer = null;
    function scanOnce() {
        if (scanTimer) clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
            try {
                const nodes = $all(MESSAGE_SELECTOR);
                let addedCount = 0;
                nodes.forEach((msgEl) => {
                    try {
                        const id = msgEl.getAttribute("data-message-id");
                        if (!id || recorded.has(id)) return;

                        // 只记录明显为"用户"的消息（示例里用户消息 class 有 justify-end）
                        if (!isUserMessage(msgEl)) return;

                        const text = getMessageText(msgEl);
                        if (!text) return;

                        // 添加书签
                        recorded.add(id);
                        const node = makeBookmarkNode(msgEl, text);
                        bookmarkList.prepend(node); // 新的放上面
                        addedCount++;
                    } catch (e) { /* ignore single msg errors */ }
                });
                // console.log("scanOnce added:", addedCount);
            } catch (e) {
                console.error("scanOnce error:", e);
            }
        }, 120); // 等待短延迟以防 DOM 连续变化
    }

    /**********************
     * 搜索功能
     **********************/
    searchBox.addEventListener("input", () => {
        const key = searchBox.value.trim().toLowerCase();
        Array.from(bookmarkList.children).forEach(child => {
            const text = child.innerText.toLowerCase();
            child.style.display = text.includes(key) ? "block" : "none";
        });
    });

    /**********************
     * 刷新脚本（不刷新页面）
     **********************/
    function reloadScript() {
        recorded.clear();
        bookmarkList.innerHTML = "";
        if (observer) observer.disconnect();

        setTimeout(() => {
            scanOnce();
            observer.observe(document.body, { childList: true, subtree: true });
        }, 150);
    }

    refreshBtn.addEventListener("click", () => {
        refreshBtn.style.transform = "rotate(180deg)";
        setTimeout(() => refreshBtn.style.transform = "", 260);
        reloadScript();
    });

    /**********************
     * MutationObserver：持续监听新消息
     **********************/
    function startObserver() {
        if (observer) observer.disconnect();
        observer = new MutationObserver((mutations) => {
            // 当 DOM 变动时触发扫描
            scanOnce();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /**********************
     * Init
     **********************/
    // 初始扫描（页面已打开时）
    scanOnce();
    startObserver();

    /**********************
     * 可选：允许右键手动加入（当自动未捕获时）
     **********************/
    document.addEventListener("contextmenu", (e) => {
        try {
            const el = e.target.closest && e.target.closest(MESSAGE_SELECTOR);
            if (!el) return;
            // 只对用户消息提供手动加入
            if (!isUserMessage(el)) return;
            // small prompt to confirm
            // don't block UI if not desired — use confirm briefly
            setTimeout(() => {
                if (!confirm("将此消息加入书签？（确定：是）")) return;
                const id = el.getAttribute("data-message-id") || Math.random().toString(36).slice(2,9);
                if (recorded.has(id)) return alert("已存在书签");
                const txt = getMessageText(el);
                recorded.add(id);
                const node = makeBookmarkNode(el, txt);
                bookmarkList.prepend(node);
            }, 50);
        } catch (err) { /* ignore */ }
    }, false);

    /**********************
     * 小优化：当面板显示时自动聚焦搜索框
     **********************/
    const origCubeHandler = cube.onclick;
    cube.addEventListener("click", () => {
        // slight delay for panel display
        setTimeout(() => {
            if (panel.style.display !== "none") {
                const sb = document.getElementById("db_searchBox") || searchBox;
                sb && sb.focus && sb.focus();
            }
        }, 120);
    });

})();

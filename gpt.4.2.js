// ==UserScript==
// @name         ChatGPT Bookmark Manager — Purple Glass Edition
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  毛玻璃紫色主题，可折叠小方块，记录用户问题，可搜索、可刷新脚本、可拖动。
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    let recorded = new Set();
    let observer = null;
    let isCollapsed = true;

    /* ---------------- 工具函数 ---------------- */
    const $ = (q) => document.querySelector(q);
    const $all = (q) => document.querySelectorAll(q);

    /* ---------------- 折叠小方块 ---------------- */
    const cube = document.createElement("div");
    Object.assign(cube.style, {
        position: "fixed",
        top: "60px",
        right: "20px",
        width: "40px",
        height: "40px",
        background: "rgba(160,120,255,0.25)",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.45)",
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: "20px",
        color: "#ffffff",
        zIndex: "9999999999",
        boxShadow: "0 4px 20px rgba(80,0,140,0.35)",
        transition: "0.25s",
    });
    cube.innerText = "📌";
    document.body.appendChild(cube);

    /* ---------------- 主面板（玻璃紫色） ---------------- */
    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "fixed",
        top: "80px",
        right: "30px",
        width: "300px",
        backdropFilter: "blur(20px)",
        background: "rgba(160, 120, 255, 0.22)",
        border: "1px solid rgba(255,255,255,0.40)",
        borderRadius: "18px",
        padding: "14px",
        zIndex: "999999999",
        fontSize: "14px",
        maxHeight: "70vh",
        overflowY: "auto",
        boxShadow: "0 8px 28px rgba(80, 0, 140, 0.25)",
        color: "#ffffff",
        transition: "0.25s ease",
        display: "none"
    });
    document.body.appendChild(panel);

    /* ---------------- 面板内容 ---------------- */
    panel.innerHTML = `
        <div style="font-weight:700;font-size:15px;margin-bottom:10px;color:#fff;">
            📑 问题书签
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            <input id="searchBox" type="text" placeholder="搜索…"
                style="
                    flex:1;
                    padding:6px 10px;
                    border-radius:10px;
                    border:1px solid rgba(255,255,255,0.35);
                    background:rgba(255,255,255,0.20);
                    color:#fff;
                    outline:none;
                    backdrop-filter:blur(10px);
                ">

            <button id="refreshBtn"
                style="
                    width:36px;
                    height:36px;
                    border-radius:10px;
                    border:1px solid rgba(255,255,255,0.40);
                    background:rgba(255,255,255,0.25);
                    cursor:pointer;
                    font-size:18px;
                    color:#fff;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    backdrop-filter:blur(10px);
                ">🔄</button>
        </div>

        <div id="bookmarkList"></div>
    `;

    const searchBox = $("#searchBox");
    const refreshBtn = $("#refreshBtn");
    const bookmarkList = $("#bookmarkList");

    /* ---------------- 折叠/展开逻辑 ---------------- */
    cube.onclick = () => {
        isCollapsed = !isCollapsed;
        panel.style.display = isCollapsed ? "none" : "block";
        cube.style.transform = isCollapsed ? "scale(1)" : "rotate(45deg)";
    };

    /* ---------------- 可拖动面板 ---------------- */
    let drag = false;
    let ox = 0, oy = 0;

    panel.addEventListener("mousedown", (e) => {
        if (["INPUT", "BUTTON"].includes(e.target.tagName)) return;
        drag = true;
        ox = e.clientX - panel.offsetLeft;
        oy = e.clientY - panel.offsetTop;
        panel.style.transition = "0s";
    });

    document.addEventListener("mousemove", (e) => {
        if (!drag) return;
        panel.style.left = e.clientX - ox + "px";
        panel.style.top = e.clientY - oy + "px";
    });
    document.addEventListener("mouseup", () => {
        drag = false;
        panel.style.transition = "0.25s";
    });

    /* ---------------- 提取用户问题 ---------------- */
    function extractQuestion(msg) {
        const bubble = msg.querySelector(".user-message-bubble-color .whitespace-pre-wrap");
        return bubble ? bubble.innerText.trim() : "";
    }

    /* ---------------- 扫描并生成书签 ---------------- */
    function scanQuestions() {
        const msgs = $all('div[data-message-author-role="user"]');

        msgs.forEach((msg) => {
            const id = msg.getAttribute("data-message-id");
            if (!id || recorded.has(id)) return;

            const Q = extractQuestion(msg);
            if (!Q) return;

            recorded.add(id);

            const block = document.createElement("div");
            block.style.marginBottom = "10px";

            // 标签标题
            const blockTitle = document.createElement("div");
            blockTitle.innerText = "■ " + Q.slice(0, 20) + (Q.length > 20 ? "…" : "");
            Object.assign(blockTitle.style, {
                cursor: "pointer",
                fontWeight: "600",
                padding: "6px 10px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.18)",
                border: "1px solid rgba(255,255,255,0.28)",
                backdropFilter: "blur(8px)",
                color: "#d8b4ff",
            });

            // 内容折叠
            const detail = document.createElement("div");
            detail.innerText = Q;
            Object.assign(detail.style, {
                display: "none",
                marginTop: "6px",
                padding: "10px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.18)",
                border: "1px solid rgba(255,255,255,0.20)",
                color: "#f8f3ff",
                backdropFilter: "blur(10px)",
            });

            blockTitle.onclick = () => {
                detail.style.display =
                    detail.style.display === "none" ? "block" : "none";

                msg.scrollIntoView({ behavior: "smooth", block: "center" });
                msg.style.outline = "3px solid #ffb8ff";
                setTimeout(() => (msg.style.outline = ""), 1500);
            };

            block.appendChild(blockTitle);
            block.appendChild(detail);
            bookmarkList.appendChild(block);
        });
    }

    /* ---------------- 搜索过滤 ---------------- */
    searchBox.addEventListener("input", () => {
        const key = searchBox.value.toLowerCase();
        [...bookmarkList.children].forEach((item) => {
            item.style.display = item.innerText.toLowerCase().includes(key)
                ? "block"
                : "none";
        });
    });

    /* ---------------- 刷新脚本（不刷新网页） ---------------- */
    refreshBtn.onclick = () => {
        refreshBtn.style.transform = "rotate(180deg)";
        setTimeout(() => (refreshBtn.style.transform = ""), 300);

        recorded.clear();
        bookmarkList.innerHTML = "";

        if (observer) observer.disconnect();
        setTimeout(() => {
            scanQuestions();
            observer.observe(document.body, { childList: true, subtree: true });
        }, 100);
    };

    /* ---------------- 初始化监听 ---------------- */
    scanQuestions();
    observer = new MutationObserver(() => scanQuestions());
    observer.observe(document.body, { childList: true, subtree: true });
})();

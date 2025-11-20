// ==UserScript==
// @name         ChatGPT 问题书签（折叠面板 + 优化UI + 直接跳转）
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  自动记录用户问题，生成美观标签，面板可折叠，点击标签可直接跳转问题位置！
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    // ===== 右侧书签面板 =====
    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "fixed",
        top: "100px",
        right: "20px",
        width: "280px",
        maxHeight: "70vh",
        overflowY: "auto",
        background: "white",
        border: "2px solid #b4a8ff",
        borderRadius: "14px",
        padding: "10px",
        zIndex: 99999,
        fontSize: "14px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
        transition: "all 0.2s ease"
    });

    // ===== 面板标题（可折叠） =====
    const header = document.createElement("div");
    header.style.cursor = "pointer";
    header.style.fontWeight = "700";
    header.style.color = "#5533cc";
    header.style.marginBottom = "8px";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.innerHTML = "📌 <span style='margin-left:6px'>我的问题书签</span>";

    const contentBox = document.createElement("div");
    contentBox.id = "bookmarkList";

    header.onclick = () => {
        if (contentBox.style.display === "none") {
            contentBox.style.display = "block";
        } else {
            contentBox.style.display = "none";
        }
    };

    panel.appendChild(header);
    panel.appendChild(contentBox);
    document.body.appendChild(panel);

    const added = new Set();

    // 核心扫描
    function scan() {
        const msgs = document.querySelectorAll('div[data-message-author-role="user"]');

        msgs.forEach(msg => {
            const id = msg.getAttribute("data-message-id");
            if (!id || added.has(id)) return;

            const textNode = msg.querySelector(".user-message-bubble-color .whitespace-pre-wrap");
            if (!textNode) return;

            const question = textNode.innerText.trim();
            if (!question) return;

            added.add(id);

            // ===== 标签项 =====
            const item = document.createElement("div");
            Object.assign(item.style, {
                marginBottom: "10px",
                background: "#f7f4ff",
                padding: "10px",
                borderRadius: "12px",
                border: "1px solid #d6ccff",
                cursor: "pointer",
                color: "#6633dd",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                transition: "all 0.15s ease"
            });

            item.onmouseover = () => item.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
            item.onmouseout  = () => item.style.boxShadow = "0 2px 6px rgba(0,0,0,0.05)";

            // ===== 标题（点击跳转）=====
            const title = document.createElement("div");
            title.style.fontWeight = "600";
            title.style.fontSize = "14px";
            title.innerText = question.slice(0, 20) + (question.length > 20 ? "..." : "");

            // ===== 折叠内容 =====
            const body = document.createElement("div");
            body.innerText = question;
            Object.assign(body.style, {
                marginTop: "8px",
                background: "#eee9ff",
                padding: "8px",
                borderRadius: "8px",
                display: "none",
                color: "#5522cc"
            });

            // 单击标题 = 直接跳转
            title.onclick = (e) => {
                e.stopPropagation();
                msg.scrollIntoView({ behavior: "smooth", block: "center" });
                msg.style.outline = "3px solid #8a63ff";
                setTimeout(() => msg.style.outline = "", 1600);
            };

            // 点击整个卡片 = 展开/收起内容
            item.onclick = () => {
                body.style.display = (body.style.display === "none" ? "block" : "none");
            };

            item.appendChild(title);
            item.appendChild(body);
            contentBox.appendChild(item);
        });
    }

    // 初次扫描 + 监听 DOM
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();

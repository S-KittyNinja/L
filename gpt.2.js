// ==UserScript==
// @name         ChatGPT 自动问题书签（折叠+跳转+紫色文字）
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动记录每条用户提问，生成可折叠紫色书签，点击即可跳转回原问题！
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    // ===== 创建右侧书签面板 =====
    const bookmarkPanel = document.createElement("div");
    Object.assign(bookmarkPanel.style, {
        position: "fixed",
        top: "100px",
        right: "20px",
        width: "260px",
        maxHeight: "70vh",
        overflowY: "auto",
        background: "white",
        border: "2px solid #ccc",
        borderRadius: "12px",
        padding: "12px",
        zIndex: "99999",
        fontSize: "14px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
    });
    bookmarkPanel.innerHTML = "<b>📌 我的问题书签</b><div id='bookmarkList'></div>";
    document.body.appendChild(bookmarkPanel);

    const list = document.getElementById("bookmarkList");
    const added = new Set();

    // ===== 核心扫描函数 =====
    function scan() {
        const messages = document.querySelectorAll(
            'div[data-message-author-role="user"]'
        );

        messages.forEach(msg => {
            const id = msg.getAttribute("data-message-id");
            if (!id || added.has(id)) return;

            const textNode = msg.querySelector(".user-message-bubble-color .whitespace-pre-wrap");
            if (!textNode) return;

            const question = textNode.innerText.trim();
            if (!question) return;

            added.add(id);

            // === 创建折叠项 ===
            const item = document.createElement("div");
            item.style.marginTop = "8px";

            const toggle = document.createElement("div");
            toggle.innerText = "■ " + question.slice(0, 18) + (question.length > 18 ? "..." : "");
            Object.assign(toggle.style, {
                cursor: "pointer",
                color: "purple",
                fontWeight: "600",
                marginBottom: "4px"
            });

            const body = document.createElement("div");
            Object.assign(body.style, {
                display: "none",
                padding: "6px 8px",
                background: "#f4eaff",
                borderRadius: "8px",
                color: "purple"
            });
            body.innerText = question;

            toggle.onclick = () => {
                body.style.display = (body.style.display === "none" ? "block" : "none");

                // 跳转到原消息
                msg.scrollIntoView({ behavior: "smooth", block: "center" });
                msg.style.outline = "3px solid purple";
                setTimeout(() => (msg.style.outline = ""), 1500);
            };

            item.appendChild(toggle);
            item.appendChild(body);
            list.appendChild(item);
        });
    }

    // ===== 初次扫描 & 监听 DOM =====
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
})();

// ==UserScript==
// @name         ChatGPT Bookmark youjianban
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Capture full user question text (joins fragment nodes), bookmarks with purple style + collapse button
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // small config
    const MAX_DISPLAY_CHARS = 120; // 在侧栏显示的预览长度
    const USER_WINDOW_MS = 2500;

    let processed = new WeakSet();
    let expectUserMessageUntil = 0;

    /**************** UI: toggle button + sidebar ****************/
    function createUI() {
        if (document.getElementById('bmToggle')) return;

        const btn = document.createElement("div");
        btn.id = "bmToggle";
        btn.innerText = "📌 书签";
        btn.style.cssText = `
            position: fixed;
            top: 90px;
            right: 20px;
            background: #6A0DAD;
            color: white;
            padding: 10px 14px;
            border-radius: 10px;
            cursor: pointer;
            z-index: 100000;
            user-select:none;
            box-shadow: 0 3px 10px rgba(0,0,0,0.25);
        `;
        document.body.appendChild(btn);

        const bar = document.createElement("div");
        bar.id = "bmSidebar";
        bar.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            width: 320px;
            max-height: 78vh;
            overflow-y: auto;
            padding: 12px;
            background: #ffffff;
            border: 1px solid #ccc;
            border-radius: 12px;
            z-index: 100000;
            box-shadow: 0 0 12px rgba(0,0,0,0.22);
            font-size: 14px;
            display: none;
        `;
        bar.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <b style="color:#4B0082;font-size:15px;">📌 问题书签</b>
                <button id="bmClearAll" style="background:transparent;border:none;cursor:pointer;font-size:16px;">✖</button>
            </div>
            <div id="bmList" style="margin-top:10px;"></div>
        `;
        document.body.appendChild(bar);

        btn.onclick = () => {
            const show = bar.style.display === "none";
            bar.style.display = show ? "block" : "none";
            btn.innerText = show ? "📌 收起" : "📌 书签";
        };

        document.getElementById("bmClearAll").onclick = () => {
            if (confirm("清空所有书签？")) document.getElementById("bmList").innerHTML = "";
        };
    }

    createUI();
    const bmList = document.getElementById("bmList");

    /**************** Helpers ****************/
    function markExpectUserMessage() {
        expectUserMessageUntil = Date.now() + USER_WINDOW_MS;
    }
    function isExpectingUserMessage() {
        return Date.now() <= expectUserMessageUntil;
    }

    // Listen for send events (click send button or Enter)
    document.addEventListener("click", (e) => {
        const t = e.target;
        if (!t) return;
        // heuristics: aria-label=Send OR has send title OR ancestor has such attribute
        if (t.closest && (t.closest("[aria-label='Send']") || t.closest("button[title*='send'],button[aria-label*='Send']"))) {
            markExpectUserMessage();
        }
    }, true);

    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) markExpectUserMessage();
    }, true);

    /**************** Get full message text from message container ****************/
    function extractFullMessageTextFromNode(node) {
        // We try a few strategies to find the whole user-message container:
        // 1. Find closest ancestor that has data-message-author-role attribute (common)
        // 2. Fallback: find a container with role="group" or similar that wraps the message
        // 3. Fallback: use the closest parent with many whitespace-pre-wrap children or take parentElement

        if (!node) return "";

        // 1) closest ancestor with explicit attribute marking author
        let container = node.closest && (node.closest("[data-message-author-role]") || node.closest("[data-author]"));
        if (container) {
            // collect visible text inside container (exclude placeholder)
            return container.innerText.trim();
        }

        // 2) try role="group" or common message wrapper classes
        container = node.closest && (node.closest('[role="group"]') || node.closest('[role="article"]'));
        if (container) return container.innerText.trim();

        // 3) if node itself is one fragment, try to join sibling fragments inside the same parent
        const parent = node.parentElement;
        if (parent) {
            // collect text from all children that look like message fragments (whitespace-pre-wrap or similar)
            const fragments = parent.querySelectorAll?.("div.whitespace-pre-wrap, p, span") || [];
            if (fragments.length) {
                let combined = "";
                fragments.forEach(f => {
                    const t = (f.innerText || "").trim();
                    if (t) combined += (combined ? "\n" : "") + t;
                });
                if (combined) return combined.trim();
            }
            // fallback to parent's text
            return parent.innerText.trim();
        }

        // last resort
        return (node.innerText || "").trim();
    }

    /**************** Add bookmark UI node ****************/
    function addBookmarkForContainer(containerNode, fullText) {
        // avoid duplicates by checking processed set on containerNode
        if (processed.has(containerNode)) return;
        processed.add(containerNode);

        const preview = fullText.length > MAX_DISPLAY_CHARS ? fullText.slice(0, MAX_DISPLAY_CHARS) + "..." : fullText;

        const item = document.createElement("div");
        item.style.cssText = `
            margin:8px 0;
            padding:8px;
            border-radius:8px;
            background:#f3e8ff;
            border:1px solid #d4b8ff;
            color:#6A0DAD;
            cursor:pointer;
            white-space:pre-wrap;
            font-size:13px;
        `;
        item.title = fullText;
        item.innerText = preview;

        item.onclick = () => {
            try {
                containerNode.scrollIntoView({ behavior: "smooth", block: "center" });
                const prev = containerNode.style.background;
                containerNode.style.transition = "background 0.25s";
                containerNode.style.background = "yellow";
                setTimeout(() => containerNode.style.background = prev || "", 1400);
            } catch (err) {
                console.warn("Bookmark jump error:", err);
            }
        };

        bmList.appendChild(item);
    }

    /**************** Mutation observer ****************/
    const mo = new MutationObserver((mutations) => {
        for (const mut of mutations) {
            for (const added of mut.addedNodes) {
                if (added.nodeType !== 1) continue;

                // gather candidate fragment nodes: whitespace-pre-wrap or nodes containing them
                const candidates = [];
                if (added.matches && added.matches("div.whitespace-pre-wrap")) candidates.push(added);
                candidates.push(...Array.from(added.querySelectorAll?.("div.whitespace-pre-wrap") || []));

                // also consider text containers such as divs with class 'whitespace-pre-wrap' being children of message container
                for (const node of candidates) {
                    // ignore placeholders
                    if (node.classList && node.classList.contains("placeholder")) continue;

                    // only proceed if we're within the "user sent" window
                    if (!isExpectingUserMessage()) continue;

                    // find container and extract full text
                    const container = node.closest && (node.closest("[data-message-author-role]") || node.closest("[data-author]") || node.closest('[role="group"]') || node.parentElement) || node;
                    if (!container) continue;

                    const fullText = extractFullMessageTextFromNode(node);
                    if (!fullText) continue;

                    // basic question detection
                    if (!(/[?？]|怎么|如何|吗|为什么|为何/.test(fullText))) continue;

                    addBookmarkForContainer(container, fullText);
                }
            }
        }
    });

    // start observing once body exists
    function start() {
        if (!document.body) return setTimeout(start, 300);
        mo.observe(document.body, { childList: true, subtree: true });
    }
    start();

    // small helper: manual add on right-click if needed
    document.addEventListener('contextmenu', (e) => {
        try {
            const node = e.target.closest && (e.target.closest('div.whitespace-pre-wrap') || e.target);
            if (!node) return;
            if (!confirm("把此条加入书签？(确定：是)")) return;
            const container = node.closest && (node.closest("[data-message-author-role]") || node.parentElement) || node;
            const text = extractFullMessageTextFromNode(node);
            if (!text) return alert("无法获取文本内容");
            addBookmarkForContainer(container, text);
        } catch (err) {
            /* ignore */
        }
    }, false);

})();

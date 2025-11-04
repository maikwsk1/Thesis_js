(function () {
    // ====== ゲーム定義（共通） ======
    const baseItems = [
        { x: 0, y: 0, emoji: "🥩", type: "fridge" },
        { x: 2, y: 0, emoji: "🥬", type: "fridge" },
        { x: 3, y: 0, emoji: "🍅", type: "fridge" },
        { x: 4, y: 0, emoji: "🫓", type: "fridge" },
        { x: 4, y: 2, emoji: "🔪", type: "fixed", name: "包丁" },
        { x: 5, y: 2, emoji: "🔥", type: "fixed", name: "火" },
        { x: 6, y: 0, emoji: "🍽️", type: "fixed", name: "提供場所" },
        { x: 8, y: 4, emoji: "🧾", type: "serve" }
    ];

    const BURGER_RECIPES = {
        "ハンバーガー": ["🫓", "🥩", "🥬"],
        "ベジバーガー": ["🫓", "🥬", "🍅"],
        "ミートサンド": ["🫓", "🥩"]
    };

    // ====== 状態 ======
    let spawnedItems = [], px = 1, py = 1, holding = null;
    let timer = parseInt(document.getElementById("timer").textContent, 10) || 120;
    let playing = false, pausedTime = null;
    let activeOrders = [];
    let score = 0;

    // Expressでは注文生成・寿命進行・スコア-30はサーバが行う（あなたのserver.jsの仕様）
    let fetchStatusInterval = null;

    // ====== DOM ======
    const grid = document.getElementById("grid"),
        timerEl = document.getElementById("timer"),
        orderEl = document.getElementById("orderContainer"),
        scoreEl = document.getElementById("score"),
        startBtn = document.getElementById("startBtn"),
        pauseBtn = document.getElementById("pauseBtn"),
        resumeBtn = document.getElementById("resumeBtn"),
        endBtn = document.getElementById("endBtn");

    // ====== ユーティリティ ======
    function genId() { return 's-' + Math.random().toString(36).slice(2, 9); }
    function findCell(x, y) { return [...grid.children].find(c => +c.dataset.x === x && +c.dataset.y === y); }
    function isProcessed(it) {
        if (!it) return false;
        if (it.emoji === "🥩") return it.checked && it.cooked;
        if (["🥬", "🍅"].includes(it.emoji)) return it.checked;
        return false;
    }
    function multisetsEqual(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        const freq = {};
        for (const x of a) freq[x] = (freq[x] || 0) + 1;
        for (const x of b) { if (!freq[x]) return false; freq[x]--; }
        return true;
    }
    function normalizeOrderItems(itemsStr) {
        return itemsStr.split("+").map(t => t.trim().replace(/:cooked|:cut/g, ""));
    }

    // ====== バーガー合成 ======
    function combineToBurger(x, y) {
        const plate = baseItems.find(b => b.x === x && b.y === y && b.emoji === "🍽️");
        if (!plate) return;
        const cellItems = spawnedItems.filter(it => it.x === x && it.y === y && !it.isBurger);
        const bread = cellItems.filter(it => it.emoji === "🫓");
        const processed = cellItems.filter(isProcessed);
        if (bread.length > 0 && processed.length > 0) {
            let burger = spawnedItems.find(it => it.x === x && it.y === y && it.isBurger);
            if (!burger) {
                burger = { x, y, emoji: "🍔", id: genId(), isBurger: true, contents: [] };
                spawnedItems.push(burger);
            }
            if (!burger.contents.includes("🫓")) burger.contents.push("🫓");
            processed.forEach(it => {
                if (!burger.contents.includes(it.emoji)) burger.contents.push(it.emoji);
                spawnedItems = spawnedItems.filter(s => s.id !== it.id);
            });
            const idx = spawnedItems.findIndex(s => s.x === x && s.y === y && s.emoji === "🫓");
            if (idx >= 0) spawnedItems.splice(idx, 1);
        }
    }

    // ====== 描画 ======
    function renderGrid() {
        grid.innerHTML = "";
        for (let y = 0; y < 5; y++)
            for (let x = 0; x < 9; x++) {
                const cell = document.createElement("div");
                cell.className = "cell"; cell.dataset.x = x; cell.dataset.y = y;
                grid.appendChild(cell);
            }
        baseItems.forEach(it => {
            const cell = findCell(it.x, it.y);
            if (!cell) return;
            const e = document.createElement("div");
            e.className = "emoji"; e.textContent = it.emoji;
            if (it.name) e.title = it.name;
            cell.appendChild(e);
        });
        spawnedItems.forEach(it => { if (!it.isBurger) combineToBurger(it.x, it.y); });
        spawnedItems.forEach(it => {
            const cell = findCell(it.x, it.y);
            if (!cell) return;
            const e = document.createElement("div");
            e.className = "emoji"; e.textContent = it.emoji;
            if (it.checked) e.classList.add("checked");
            if (it.cooked && it.emoji === "🥩") e.classList.add("cooked");
            cell.appendChild(e);
            if (it.isBurger && it.contents) {
                const tip = document.createElement("div");
                tip.className = "burger-tooltip";
                tip.textContent = it.contents.join(",");
                cell.appendChild(tip);
            }
        });
        const playerEl = document.createElement("div");
        playerEl.className = "player";
        const pcell = findCell(px, py);
        if (pcell) pcell.appendChild(playerEl);
        if (holding && pcell) {
            const held = document.createElement("div");
            held.className = "emoji"; held.textContent = holding.emoji;
            if (holding.checked) held.classList.add("checked");
            if (holding.cooked && holding.emoji === "🥩") held.classList.add("cooked");
            held.style.zIndex = 60; pcell.appendChild(held);
            if (holding.isBurger && holding.contents) {
                const tip = document.createElement("div");
                tip.className = "burger-tooltip"; tip.textContent = holding.contents.join(",");
                pcell.appendChild(tip);
            }
        }
        scoreEl.textContent = `スコア: ${score}`;
        timerEl.textContent = timer > 0 ? timer : "終了";
    }

    // ====== 操作 ======
    function handleDAction() {
        if (!playing) return;
        if (!holding) {
            const idx = spawnedItems.findIndex(it => it.x === px && it.y === py);
            if (idx >= 0) { holding = spawnedItems.splice(idx, 1)[0]; renderGrid(); return; }
            const fridge = baseItems.find(f => f.type === "fridge" && f.x === px && f.y === py);
            if (fridge) { holding = { emoji: fridge.emoji, id: genId(), checked: false, cooked: false }; renderGrid(); return; }
        } else {
            const serve = baseItems.find(f => f.type === "serve" && f.x === px && f.y === py);
            if (holding.isBurger && serve) {
                let matched = false;
                for (let i = 0; i < activeOrders.length; i++) {
                    const order = activeOrders[i];
                    const orderContents = normalizeOrderItems(order.items).sort(); // :cut/:cookedを無視して比較
                    const holdingContents = (holding.contents || []).slice().sort();
                    if (multisetsEqual(orderContents, holdingContents)) {
                        score += 100;
                        // サーバへスコア反映
                        fetch("/score_update", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ sessionId: "anon", score })
                        }).catch(() => { });
                        order.div?.remove();
                        activeOrders.splice(i, 1);
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    score -= 30;
                    fetch("/score_update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionId: "anon", score })
                    }).catch(() => { });
                }
                scoreEl.textContent = `スコア: ${score}`;
                holding = null; renderGrid(); return;
            }
            spawnedItems.push({ ...holding, x: px, y: py });
            holding = null; renderGrid();
        }
    }

    function handleWAction() {
        if (!playing) return;
        if (px === 4 && py === 2)
            spawnedItems.forEach(it => { if (it.x === px && it.y === py && ["🥩", "🥬", "🍅"].includes(it.emoji)) it.checked = true; });
        if (px === 5 && py === 2)
            spawnedItems.forEach(it => { if (it.x === px && it.y === py && it.emoji === "🥩" && it.checked) it.cooked = true; });
        renderGrid();
    }

    document.addEventListener("keydown", e => {
        if (!playing) return;
        if (e.key.startsWith("Arrow")) e.preventDefault();
        if (e.key === "ArrowUp" && py > 0) py--;
        if (e.key === "ArrowDown" && py < 4) py++;
        if (e.key === "ArrowLeft" && px > 0) px--;
        if (e.key === "ArrowRight" && px < 8) px++;
        if (e.key.toLowerCase() === "d") handleDAction();
        if (e.key.toLowerCase() === "w") handleWAction();
        renderGrid();
    });

    // ====== 注文UI（サーバの状態を描画） ======
    function renderOrderVisual(order) {
        const tokens = order.items.split(" + ").map(t => t.trim());
        const block = document.createElement("div");
        block.className = "order-block";
        const itemsRow = document.createElement("div");
        itemsRow.className = "order-items-row";
        tokens.forEach(token => {
            const [emoji, tag] = token.split(":");
            const item = document.createElement("div");
            item.className = "order-item";
            const eSpan = document.createElement("div");
            eSpan.className = "order-emoji"; eSpan.textContent = emoji;
            const tSpan = document.createElement("div");
            tSpan.className = "order-tool"; tSpan.textContent = tag ? (tag === "cooked" ? "🔪🔥" : "🔪") : "";
            item.appendChild(eSpan); item.appendChild(tSpan);
            itemsRow.appendChild(item);
        });
        const timeDiv = document.createElement("div");
        timeDiv.className = "order-time";
        timeDiv.textContent = `残り${order.remain}秒`;
        block.appendChild(itemsRow);
        block.appendChild(timeDiv);
        order.div = block;
        orderEl.appendChild(block);
    }

    // ====== サーバ状態を定期取得（唯一の真実をサーバに） ======
    async function fetchStatus() {
        try {
            const res = await fetch("/status");
            const data = await res.json();
            if (typeof data.currentTime === "number") {
                timer = data.currentTime;
                timerEl.textContent = timer > 0 ? timer : "終了";
            }
            if (Array.isArray(data.activeOrders)) {
                activeOrders = data.activeOrders.map(o => ({ ...o, div: null }));
                orderEl.innerHTML = "";
                activeOrders.forEach(o => renderOrderVisual(o));
            }
            if (typeof data.score === "number") {
                score = data.score;
                scoreEl.textContent = `スコア: ${score}`;
            }
        } catch (err) { console.error(err); }
    }

    // ====== ボタン ======
    startBtn.onclick = async () => {
        if (playing) return;
        playing = true;
        // クライアント側の表示状態を初期化（あなたの元コード踏襲）
        spawnedItems = [];
        px = 1; py = 1; holding = null;
        score = 0;
        activeOrders = [];
        orderEl.innerHTML = "";
        scoreEl.textContent = `スコア: 0`;
        renderGrid();

        // サーバ開始
        const res = await fetch("/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seconds: timer })
        });
        const data = await res.json();
        if (data.hideStartBtn) startBtn.style.display = "none";
        // サーバを唯一の真実とし毎秒同期
        clearInterval(fetchStatusInterval);
        await fetchStatus();
        fetchStatusInterval = setInterval(fetchStatus, 1000);
    };

    pauseBtn.onclick = async () => {
        if (!playing) return;
        const res = await fetch("/pause", { method: "POST" });
        const data = await res.json();
        pausedTime = data.currentTime;
        playing = false;
        clearInterval(fetchStatusInterval);
        fetchStatusInterval = null;
    };

    resumeBtn.onclick = async () => {
        if (playing || !pausedTime) return;
        await fetch("/resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seconds: pausedTime })
        });
        timer = pausedTime;
        playing = true;
        clearInterval(fetchStatusInterval);
        await fetchStatus();
        fetchStatusInterval = setInterval(fetchStatus, 1000);
    };

    endBtn.onclick = async () => {
        await fetch("/end", { method: "POST" });
        playing = false;
        clearInterval(fetchStatusInterval);
        window.location.href = "/";
    };

    // ====== 初期表示（Expressは最初からサンプル表示でもOK） ======
    // あなたの元コードに合わせ、開始前に数個置いてもよいが、
    // サーバ同期を唯一の真実にしたのでここでは描画のみ。
    renderGrid();
})();

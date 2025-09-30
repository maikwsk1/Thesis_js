(function () {
    const BURGER_RECIPES = {
        "ハンバーガー": ["🫓", "🥩:cooked", "🥬:cut"],
        "ベジバーガー": ["🫓", "🥬:cut", "🍅:cut"],
        "ミートサンド": ["🫓", "🥩:cooked"]
    };

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

    let spawnedItems = [], px = 1, py = 1, holding = null;
    let timer = parseInt(document.getElementById("timer").textContent);
    let playing = false, pausedTime = null;
    let activeOrders = [];
    let score = 0;

    const grid = document.getElementById("grid"),
        timerEl = document.getElementById("timer"),
        orderEl = document.getElementById("orderContainer"),
        scoreEl = document.getElementById("score"),
        startBtn = document.getElementById("startBtn"),
        pauseBtn = document.getElementById("pauseBtn"),
        resumeBtn = document.getElementById("resumeBtn"),
        endBtn = document.getElementById("endBtn");

    // -----------------------------------
    // ユーティリティ
    function genId() { return 's-' + Math.random().toString(36).slice(2, 9); }
    function findCell(x, y) { return [...grid.children].find(c => +c.dataset.x === x && +c.dataset.y === y); }
    function isProcessed(it) { return (it.checked || it.cooked) && ["🥩", "🥬", "🍅"].includes(it.emoji); }
    function multisetsEqual(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        const freq = {};
        a.forEach(x => freq[x] = (freq[x] || 0) + 1);
        for (const x of b) {
            if (!freq[x]) return false;
            freq[x]--;
        }
        return true;
    }

    // -----------------------------------
    // ゲーム終了
    endBtn.onclick = async () => {
        await fetch("/end", { method: "POST" });
        playing = false;
        window.location.href = "/";
    };

    startBtn.onclick = async () => {
        const res = await fetch("/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seconds: timer })
        });

        const data = await res.json();

        if (data.hideStartBtn) {
            startBtn.style.display = "none";
        }

        playing = true;
        renderGrid();
    };
    pauseBtn.onclick = async () => {
        const res = await fetch("/pause", { method: "POST" });
        const data = await res.json();
        pausedTime = data.currentTime; // ← サーバーの残り時間を取得
        playing = false;
    };
    resumeBtn.onclick = async () => {
        if (!playing) {
            await fetch("/resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ seconds: pausedTime }) // ← 35秒から再開
            });
            timer = pausedTime;
            playing = true;
            renderGrid();
        }
    };


    // -----------------------------------
    // 注文表示
    function renderOrderVisual(order) {
        const tokens = order.items.split(" + ").map(t => t.trim());
        const block = document.createElement("div");
        block.className = "order-block";

        const itemsRow = document.createElement("div");
        itemsRow.className = "order-items-row";
        tokens.forEach(token => {
            const [emoji, tag] = token.split(":");
            const item = document.createElement("div"); item.className = "order-item";
            const eSpan = document.createElement("div"); eSpan.className = "order-emoji"; eSpan.textContent = emoji; item.appendChild(eSpan);
            const tSpan = document.createElement("div"); tSpan.className = "order-tool"; tSpan.textContent = tag ? (tag === "cooked" ? "🔪🔥" : "🔪") : ""; item.appendChild(tSpan);
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

    function addRandomOrder() {
        if (activeOrders.length >= 7) return;
        const keys = Object.keys(BURGER_RECIPES);
        const name = keys[Math.floor(Math.random() * keys.length)];
        const items = BURGER_RECIPES[name].join(" + ");
        const remain = 40;
        const order = { name, items, remain, div: null };
        activeOrders.push(order);
        renderOrderVisual(order);
    }

    // -----------------------------------
    // グリッド描画・合成
    function combineToBurger(x, y) {
        const plate = baseItems.find(b => b.x === x && b.y === y && b.emoji === "🍽️");
        if (!plate) return;
        const cellItems = spawnedItems.filter(it => it.x === x && it.y === y && !it.isBurger);
        const bread = cellItems.filter(it => it.emoji === "🫓").length;
        const processed = cellItems.filter(isProcessed);
        if (bread > 0 && processed.length > 0) {
            let burger = spawnedItems.find(it => it.x === x && it.y === y && it.isBurger);
            if (!burger) {
                burger = { x, y, emoji: "🍔", id: genId(), isBurger: true, contents: [] };
                spawnedItems.push(burger);
            }
            processed.forEach(it => {
                if (!burger.contents.includes(it.emoji)) burger.contents.push(it.emoji);
                spawnedItems = spawnedItems.filter(s => s.id !== it.id);
            });
            spawnedItems = spawnedItems.filter(s => !(s.x === x && s.y === y && s.emoji === "🫓"));
        }
    }

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
            if (cell) {
                const e = document.createElement("div");
                e.className = "emoji"; e.textContent = it.emoji;
                if (it.name) e.title = it.name;
                cell.appendChild(e);
            }
        });

        spawnedItems.forEach(it => { if (!it.isBurger) combineToBurger(it.x, it.y); });
        spawnedItems.forEach(it => {
            const cell = findCell(it.x, it.y);
            if (cell) {
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
            }
        });

        const playerEl = document.createElement("div");
        playerEl.className = "player";
        const cell = findCell(px, py); if (cell) cell.appendChild(playerEl);
        if (holding && cell) {
            const held = document.createElement("div");
            held.className = "emoji"; held.textContent = holding.emoji;
            if (holding.checked) held.classList.add("checked");
            if (holding.cooked && holding.emoji === "🥩") held.classList.add("cooked");
            held.style.zIndex = 60; cell.appendChild(held);
            if (holding.isBurger && holding.contents) {
                const tip = document.createElement("div"); tip.className = "burger-tooltip"; tip.textContent = holding.contents.join(",");
                cell.appendChild(tip);
            }
        }
    }

    // -----------------------------------
    // プレイヤー操作
    function handleDAction() {
        if (!playing) return;

        if (!holding) {
            const idx = spawnedItems.findIndex(it => it.x === px && it.y === py);
            if (idx >= 0) { holding = spawnedItems.splice(idx, 1)[0]; renderGrid(); return; }
            const fridgeHere = baseItems.find(f => f.type === "fridge" && f.x === px && f.y === py);
            if (fridgeHere) { holding = { emoji: fridgeHere.emoji, id: genId(), checked: false, cooked: false }; renderGrid(); return; }
        } else {
            const serveHere = baseItems.find(f => f.type === "serve" && f.x === px && f.y === py);
            if (holding.isBurger && serveHere) {
                let matched = false;
                for (let i = 0; i < activeOrders.length; i++) {
                    const order = activeOrders[i];
                    const orderContents = order.items.split(" + ").map(it => it.replace(/:cooked|:cut/g, "").trim()).filter(it => it !== "🫓").sort();
                    const holdingContents = (holding.contents || []).slice().sort();
                    if (multisetsEqual(orderContents, holdingContents)) {
                        score += 100;
                        scoreEl.textContent = `スコア: ${score}`;
                        order.div?.remove();
                        activeOrders.splice(i, 1);
                        matched = true;
                        break;
                    }
                }
                if (!matched) { score -= 30; scoreEl.textContent = `スコア: ${score}`; }
                holding = null; renderGrid(); return;
            }
            spawnedItems.push({ ...holding, x: px, y: py });
            holding = null;
            renderGrid();
            return;
        }
    }

    function handleWAction() {
        if (!playing) return;

        // 包丁スペース（置いたものだけ切れる）
        if (px === 4 && py === 2) {
            spawnedItems.forEach(it => {
                if (it.x === px && it.y === py && ["🥩", "🥬", "🍅"].includes(it.emoji)) {
                    it.checked = true;
                }
            });
        }

        // 火のスペース（置いた肉だけ焼ける）
        if (px === 5 && py === 2) {
            spawnedItems.forEach(it => {
                if (it.x === px && it.y === py && it.emoji === "🥩" && it.checked) {
                    it.cooked = true;
                    it.checked = false;
                }
            });
        }

        renderGrid();
    }


    document.addEventListener("keydown", e => {
        if (!playing) return;
        if (e.key.startsWith("Arrow")) e.preventDefault();
        if (e.key === "ArrowUp" && py > 0) py--;
        if (e.key === "ArrowDown" && py < 4) py++;
        if (e.key === "ArrowLeft" && px > 0) px--;
        if (e.key === "ArrowRight" && px < 8) px++;
        if (e.key === "d" || e.key === "D") handleDAction();
        if (e.key === "w" || e.key === "W") handleWAction();
        renderGrid();
    });

    // -----------------------------------
    // サーバー同期
    async function fetchStatus() {
        try {
            const res = await fetch("/status");
            const data = await res.json();
            timer = data.currentTime || 0;
            timerEl.textContent = timer > 0 ? timer : "終了";
            activeOrders = data.activeOrders || [];
            orderEl.innerHTML = "";
            activeOrders.forEach(o => renderOrderVisual(o));
        } catch (err) { console.error(err); }
    }
    setInterval(fetchStatus, 1000);

    // 初期描画
    renderGrid();

})();
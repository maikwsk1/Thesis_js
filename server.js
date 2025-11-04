// ===== モジュール設定 =====
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===== 変数定義 =====
let currentTime = 0;
let timerInterval = null;
let activeOrders = [];
let scores = {};
let isStarted = false;

// ===== 定数 =====
const BURGER_RECIPES = {
    "ハンバーガー": ["🫓", "🥩:cooked", "🥬:cut"],
    "ベジバーガー": ["🫓", "🥬:cut", "🍅:cut"],
    "ミートサンド": ["🫓", "🥩:cooked"]
};

// ===== ページルーティング =====
app.get("/", (req, res) => {
    res.render("index");
});

app.get("/hamburger", (req, res) => {
    resetGame();
    res.render("hamburger", { title: "ハンバーガーゲーム" });
});

// ===== ゲーム制御 =====
app.post("/start", (req, res) => {
    const seconds = req.body.seconds || 120;
    if (!timerInterval) {
        currentTime = seconds;
        isStarted = true;
        addRandomOrder();

        let tickCount = 0;
        timerInterval = setInterval(() => {
            currentTime--;
            tickCount++;

            // 10秒ごとに注文追加
            if (tickCount % 10 === 0 && activeOrders.length < 7) {
                addRandomOrder();
            }

            // 注文残り時間減少・スコア減点処理
            activeOrders.forEach(o => {
                o.remain--;
                if (o.remain === 0 && !o.expired) {
                    scores["anon"] = (scores["anon"] || 0) - 30;
                    o.expired = true;
                }
            });

            // 期限切れ注文を削除
            activeOrders = activeOrders.filter(o => o.remain > 0);

            // タイマー終了処理
            if (currentTime <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                currentTime = 0;
                isStarted = false;
            }
        }, 1000);
    }
    res.json({ status: "started", currentTime, "hideStartBtn": true });
});

app.post("/pause", (req, res) => {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        res.json({ status: "paused", currentTime });
    } else {
        res.json({ status: "already paused", currentTime });
    }
});

app.post("/resume", (req, res) => {
    const seconds = req.body.seconds;
    if (!timerInterval && seconds > 0) {
        currentTime = seconds;
        let tickCount = 0;

        timerInterval = setInterval(() => {
            currentTime--;
            tickCount++;

            if (tickCount % 10 === 0 && activeOrders.length < 7) {
                addRandomOrder();
            }

            activeOrders.forEach(o => {
                o.remain--;
                if (o.remain === 0 && !o.expired) {
                    scores["anon"] = (scores["anon"] || 0) - 30;
                    o.expired = true;
                }
            });

            activeOrders = activeOrders.filter(o => o.remain > 0);

            if (currentTime <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                currentTime = 0;
            }
        }, 1000);

        res.json({ status: "resumed", currentTime });
    } else {
        res.json({ status: "already running or finished", currentTime });
    }
});

app.post("/end", (req, res) => {
    clearInterval(timerInterval);
    timerInterval = null;
    currentTime = 0;
    activeOrders = [];
    isStarted = false;
    res.json({ status: "ended" });
});

// ===== 状態取得・更新 =====
app.get("/status", (req, res) => {
    const displayTime = isStarted ? currentTime : 120;
    res.json({ currentTime: displayTime, activeOrders, score: scores["anon"] || 0 });
});

app.post("/score_update", (req, res) => {
    const sessionId = req.body.sessionId || "anon";
    scores[sessionId] = req.body.score || 0;
    res.json({ status: "ok" });
});

// ===== ユーティリティ =====
function addRandomOrder() {
    const keys = Object.keys(BURGER_RECIPES);
    const name = keys[Math.floor(Math.random() * keys.length)];
    activeOrders.push({
        name,
        items: BURGER_RECIPES[name].join(" + "),
        remain: 40,
        expired: false
    });
}

function resetGame() {
    clearInterval(timerInterval);
    timerInterval = null;
    currentTime = 0;
    activeOrders = [];
    scores = {};
}

// ===== 実行 =====
app.listen(3000, () => console.log("Server running on http://localhost:3000"));

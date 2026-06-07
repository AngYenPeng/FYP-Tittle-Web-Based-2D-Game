/**
 * SaveSystem — 3 存档位系统 (参考 Hollow Knight)
 *
 *   - 3 个存档位, 各自独立存 localStorage
 *   - 存档内容: 当前场景 + 水晶/血量/心数/侵蚀度/背包/健康侦测仪/稿子升级
 *   - 自动存档: 每次进入一个 SafeZone 场景 (zone entry) + 游戏内"保存退出"
 *   - 当前存档位记在 localStorage, 没选存档位时 autoSave 跳过 (避免 dev 菜单污染)
 *   - 设置(音量/震动/亮度/改键) 是全局的, 不分存档位 → 退出后一直保留
 *
 * 用法:
 *   SaveSystem.setCurrentSlot(1);            // 选存档位
 *   SaveSystem.autoSave(scene);              // 存当前进度到当前位
 *   const data = SaveSystem.getSlot(1);      // 读
 *   SaveSystem.deleteSlot(1);                // 删
 */
class SaveSystem {
    static _slotKey(n)  { return 'abyssMinerSave_' + n; }

    static getSlot(n) {
        try {
            const raw = localStorage.getItem(SaveSystem._slotKey(n));
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    static saveSlot(n, data) {
        try { localStorage.setItem(SaveSystem._slotKey(n), JSON.stringify(data)); return true; }
        catch (e) { return false; }
    }

    static deleteSlot(n) {
        try { localStorage.removeItem(SaveSystem._slotKey(n)); } catch (e) {}
        if (SaveSystem.getCurrentSlot() === n) SaveSystem.setCurrentSlot(null);
    }

    static getCurrentSlot() {
        try {
            const v = localStorage.getItem('abyssMinerCurrentSlot');
            return (v != null && v !== '') ? parseInt(v, 10) : null;
        } catch (e) { return null; }
    }

    static setCurrentSlot(n) {
        try {
            if (n == null) localStorage.removeItem('abyssMinerCurrentSlot');
            else localStorage.setItem('abyssMinerCurrentSlot', String(n));
        } catch (e) {}
    }

    // 从场景抓当前状态 (字段与场景间继承的 data 对齐)
    // (用户) 一次性剧情完成标志 — 按命名规则自动扫场景布尔属性 (新剧情命名跟规则即自动入档)
    static _capturePlotFlags(scene) {
        const out = {};
        try {
            for (const k in scene) {
                if (/(CutsceneDone|DialogDone|TakeoffDone|IntroFinished|PlotDone|PlotPlayed)$/.test(k) && scene[k] === true) out[k] = true;   // (用户) CutsceneStarted 是瞬态不入档 — 入档会让读档后过场不再触发
            }
        } catch (e) {}
        return out;
    }

    /** (用户) 局内游戏时间: 基线(随档恢复) + 本场景实时增量. 首次调用启动计时.
     *  只在落盘点累计 → 未保存的游玩时段自然不计 (关游戏没存 = 不算时间) */
    static _tickPlayMs(scene) {
        if (!scene._playStartAt) { scene._playStartAt = Date.now(); scene._playMsBase = scene._playMsBase || 0; }
        return (scene._playMsBase || 0) + (Date.now() - scene._playStartAt);
    }

    static captureFromScene(scene) {
        const inv = (scene.inventorySystem && scene.inventorySystem.slots)
            ? [...scene.inventorySystem.slots] : null;
        return {
            scene:             (scene.scene && scene.scene.key) || null,
            crystalCount:      scene.hudSystem ? scene.hudSystem.crystalCount : 0,
            yellowCrystalCount: scene.hudSystem ? (scene.hudSystem.yellowCrystalCount || 0) : 0,   // (用户) 黄水晶入档
            yellowCrystalShown: scene.hudSystem ? !!scene.hudSystem.yellowCrystalShown : false,
            hp:                scene.healthSystem ? scene.healthSystem.hp : 100,
            maxHp:             scene.healthSystem ? scene.healthSystem.maxHp : 100,
            hearts:            scene.healthSystem ? scene.healthSystem.hearts : 5,
            corrosionPct:      scene.diseaseSystem ? scene.diseaseSystem.corrosionPct : 0,
            hasHealthDetector: !!scene._hasHealthDetector,
            hasPetSpider:      !!(scene.registry && scene.registry.get('hasPetSpider')),
            runDeaths:         (scene.registry && scene.registry.get('runDeaths')) || 0,
            difficulty:        (window.AbyssDiff ? AbyssDiff.mode : 'easy'),
            inventorySlots:    inv,
            pickaxeUpgraded:   !!((scene.registry && scene.registry.get('pickaxeUpgraded')) || scene._pickaxeUpgraded),
            plotFlags:         SaveSystem._capturePlotFlags(scene),
            playMs:            SaveSystem._tickPlayMs(scene),
            savedAt:           Date.now()
        };
    }

    // 自动存到当前 slot (没选 slot 则跳过)
    // 自动存到当前 slot (没选 slot 则跳过)
    static autoSave(scene) {
        const n = SaveSystem.getCurrentSlot();
        if (n == null) return false;
        const data = SaveSystem.captureFromScene(scene);
        
        try {
            const prev = SaveSystem.getSlot(n);
            if (prev && typeof prev.hearts === 'number' && typeof data.hearts === 'number' && data.hearts < prev.hearts) {
                data.hearts = prev.hearts;
            }
            if (prev && prev.slotName) data.slotName = prev.slotName;   // (用户) 自定义槽名随快照保留
        } catch (e) {}

        // Save local browser instance parameters first
        const localSaveSuccess = SaveSystem.saveSlot(n, data);

        // 🚨 TRIGGER CLOUD DATABASE MERGE HOOK:
        // If local storage handles correctly, dispatch a copy straight to MongoDB Atlas!
        if (localSaveSuccess) {
            SaveSystem.syncWithBackend(data);
        }

        return localSaveSuccess;
    }

    // 显示用: 场景 key → 区域名
    static zoneName(sceneKey) {
        // (用户) 区名重映射: Tutorial=Zone1, SZ1=Zone2, SZ2=Zone3, SZ2.5=Zone4, SZ3=Zone5, SZ4=Zone6, SZ5=Zone7
        const map = {
            'TutorialScene': 'Zone 1', 'HubScene': 'Hub',
            'SafeZone1Scene': 'Zone 2', 'SafeZone2Scene': 'Zone 3',
            'SafeZone25Scene': 'Zone 4', 'SafeZone3Scene': 'Zone 5',
            'SafeZone4Scene': 'Zone 6', 'SafeZone5Scene': 'Zone 7',
            'SafeZone6Scene': 'Zone 8'
        };
        return map[sceneKey] || sceneKey || 'Unknown';
    }

    // 显示用: 存档时间 → 相对描述
    static savedAgo(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const pad = (x) => (x < 10 ? '0' + x : '' + x);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // 🚨 NEW FULL-STACK SYNC METHOD: Transmits game data straight to your Express backend
    static async syncWithBackend(data) {
        try {
            // Pull the user session data saved when your web platform logged in
            // Typically stored in localStorage or sessionStorage during login response
            const loggedInUserId = localStorage.getItem("userId") || (window.CurrentUser ? window.CurrentUser.id : null);
            const loggedInUsername = localStorage.getItem("username") || (window.CurrentUser ? window.CurrentUser.username : "Guest Miner");

            if (!loggedInUserId) {
                console.log("No active user session found. Skipping cloud database synchronization.");
                return;
            }

            // Map the Phaser save data parameters into the fields expected by your score model schema
            const backendPayload = {
                userId: loggedInUserId,
                username: loggedInUsername,
                score: data.crystalCount || 0,                 // Maps saved crystals to score metrics
                time: Math.floor((data.playMs || 0) / 1000),   // Converts millisecond runtime base into seconds
                mode: data.difficulty || "easy"                // Easy/Normal/Hard option strings
            };

            console.log("Synchronizing checkpoint to MongoDB Atlas...", backendPayload);

            // Change 'localhost:3000' to your live production domain url when ready to host
            const response = await fetch("http://localhost:3000/api/score/add", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(backendPayload)
            });

            const result = await response.json();
            console.log("Server verification status:", result.message);

        } catch (error) {
            console.error("Cloud tracking database synchronization failed:", error.message);
        }
    }
}

SaveSystem.NUM_SLOTS = 3;

if (typeof window !== 'undefined') window.SaveSystem = SaveSystem;
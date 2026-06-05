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
    static captureFromScene(scene) {
        const inv = (scene.inventorySystem && scene.inventorySystem.slots)
            ? [...scene.inventorySystem.slots] : null;
        return {
            scene:             (scene.scene && scene.scene.key) || null,
            crystalCount:      scene.hudSystem ? scene.hudSystem.crystalCount : 0,
            hp:                scene.healthSystem ? scene.healthSystem.hp : 100,
            maxHp:             scene.healthSystem ? scene.healthSystem.maxHp : 100,
            hearts:            scene.healthSystem ? scene.healthSystem.hearts : 5,
            corrosionPct:      scene.diseaseSystem ? scene.diseaseSystem.corrosionPct : 0,
            hasHealthDetector: !!scene._hasHealthDetector,
            inventorySlots:    inv,
            pickaxeUpgraded:   !!((scene.registry && scene.registry.get('pickaxeUpgraded')) || scene._pickaxeUpgraded),
            savedAt:           Date.now()
        };
    }

    // 自动存到当前 slot (没选 slot 则跳过)
    static autoSave(scene) {
        const n = SaveSystem.getCurrentSlot();
        if (n == null) return false;
        return SaveSystem.saveSlot(n, SaveSystem.captureFromScene(scene));
    }

    // 显示用: 场景 key → 区域名
    static zoneName(sceneKey) {
        const map = {
            'TutorialScene': 'Tutorial', 'HubScene': 'Hub',
            'SafeZone1Scene': 'Zone 1', 'SafeZone2Scene': 'Zone 2',
            'SafeZone25Scene': 'Zone 2.5', 'SafeZone3Scene': 'Zone 3',
            'SafeZone4Scene': 'Zone 4', 'SafeZone5Scene': 'Zone 5'
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
}

SaveSystem.NUM_SLOTS = 3;

if (typeof window !== 'undefined') window.SaveSystem = SaveSystem;
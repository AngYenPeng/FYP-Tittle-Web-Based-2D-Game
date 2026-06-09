/**
 * CrystalBlock — 可被开采的水晶方块
 *
 * 行为：
 *   - 初始 HP = 18，被近战 3.5 伤害（玩家击打），HP <= 0 时摧毁掉落 1 水晶
 *   - 被打时短暂变红色 0xff0000，然后恢复
 *   - 视觉：从 Crystal_block_1/2/3 三种外观随机一个，避免单调
 *   - 物理：static，不参与 walls 组（被近战才碎）
 *
 * 用法：
 *   const ore = new CrystalBlock(scene, x, y);
 *   ore.takeHit(damage);  // 玩家近战调用
 *   ore.destroyed         // 摧毁后为 true
 */
class CrystalBlock {
    static TEXTURES = ['Crystal_block_1', 'Crystal_block_2', 'Crystal_block_3'];

    constructor(scene, x, y, opts = {}) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.hp = opts.hp ?? 10;
        this.dropCount = opts.dropCount ?? 1;
        this.destroyed = false;

        // 随机选择 1 种外观
        const tex = CrystalBlock.TEXTURES[Math.floor(Math.random() * CrystalBlock.TEXTURES.length)];
        const fallbackTex = scene.textures.exists(tex) ? tex : 'mimic_ore_img';
        this.sprite = scene.add.image(x, y, fallbackTex).setScale(1.4);
        // 旋转判定 — 优先 opts.rotation, 否则按 gridSystem 周围墙自动检测
        // 顺时针弧度: 0 = 地面长, PI/2 = 左墙长 (顺时针 90°),
        //              3PI/2 = 右墙长 (顺时针 270°), PI = 天花板长 (180°)
        let rotation = opts.rotation;
        if (rotation === undefined && scene.gridSystem) {
            const G = 32;
            const gs = scene.gridSystem;
            const col = Math.floor(x / G);
            const row = Math.floor(y / G);
            const gridCol = col - gs.originX / G;
            const gridRow = row - gs.originY / G;
            const hasWall = (c, r) => gs.getType(c, r) === GridSystem.WALL;
            if (hasWall(gridCol, gridRow + 1)) rotation = 0;                  // 下方 → 0°
            else if (hasWall(gridCol - 1, gridRow)) rotation = Math.PI / 2;   // 左墙 → 90°
            else if (hasWall(gridCol + 1, gridRow)) rotation = 3 * Math.PI / 2; // 右墙 → 270°
            else if (hasWall(gridCol, gridRow - 1)) rotation = Math.PI;       // 天花板 → 180°
            else rotation = 0;
        }
        if (rotation) this.sprite.setRotation(rotation);
        // 如果用 fallback 才上色调
        if (fallbackTex === 'mimic_ore_img') this.sprite.setTint(0x00ccff);

        // 在 GridSystem 标记为 WALL（fog 阻挡 + 玩家无法穿过）
        // 但实际不放入 walls 物理组（玩家近战才能破坏）
        if (scene.gridSystem) {
            scene.gridSystem.markRect(x, y, 32, 32, GridSystem.BLOCK);
        }
    }

    /** 重新检测旋转 — 用于场景全部 wall 加载完后修正旋转 (因为构造时部分 wall 可能还没注册) */
    redetectRotation() {
        if (this.destroyed || !this.sprite || !this.scene.gridSystem) return;
        const G = 32;
        const gs = this.scene.gridSystem;
        const col = Math.floor(this.x / G);
        const row = Math.floor(this.y / G);
        const gridCol = col - gs.originX / G;
        const gridRow = row - gs.originY / G;
        const hasWall = (c, r) => gs.getType(c, r) === GridSystem.WALL;
        let rotation = 0;
        if (hasWall(gridCol, gridRow + 1)) rotation = 0;
        else if (hasWall(gridCol - 1, gridRow)) rotation = Math.PI / 2;
        else if (hasWall(gridCol + 1, gridRow)) rotation = 3 * Math.PI / 2;
        else if (hasWall(gridCol, gridRow - 1)) rotation = Math.PI;
        this.sprite.setRotation(rotation);
    }

    /** 玩家近战命中 */
    takeHit(damage = 3.5) {
        if (this.destroyed) return;
        this.hp -= damage;
        // (用户) 每一下敲击都有声 (含剧情强制敲击 — SZ4 剧情走的就是 takeHit); 碎掉那下由 _destroy 播 CrystalBreak
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'PickaxeHitThings', { volume: AudioSystem.sfxVolume * 0.6 });   // (修复) 乘 sfxVolume
        this.sprite.setTint(0xff0000);
        this.scene.time.delayedCall(120, () => {
            if (!this.destroyed) this.sprite.clearTint();
        });
        if (this.hp <= 0) this._destroy();
    }

    _destroy() {
        this.destroyed = true;
        // (用户成就) 富贵险中求: SZ2.5 本局未死 + 全部蓝水晶挖光
        try {
            const sc = this.scene;
            if (typeof AchievementSystem !== 'undefined' && sc && sc.scene && sc.scene.key === 'SafeZone25Scene' &&
                sc._crystalOres && !sc._achDiedHere && sc._crystalOres.every(o => !o || o.destroyed)) {
                AchievementSystem.unlock(sc, 'sz25_allcry');
            }
        } catch (e) {}
        this.sprite.setVisible(false);
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'CrystalBreak');  // 破碎音效
        // GridSystem 改回 AIR（玩家可走过去）
        if (this.scene.gridSystem) {
            this.scene.gridSystem.unmarkRect(this.x, this.y, 32, 32);
            // (用户) 灰罩通知已按要求撤销 — 碎裂格沿用雾的原始规则
        }
        // 掉落水晶
        this.scene.events.emit('monster_killed', this.x, this.y, this.dropCount);
    }
}
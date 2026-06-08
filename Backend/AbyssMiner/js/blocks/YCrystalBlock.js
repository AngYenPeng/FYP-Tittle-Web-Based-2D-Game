/**
 * YCrystalBlock — 黄色水晶方块 (任务货币)
 *
 * 跟 CrystalBlock (蓝水晶) 一样可被近战开采, 但:
 *   - 视觉: 专属黄水晶贴图 YCrystal_block_1/2/3 随机一个 (不再用蓝贴图染色)
 *   - 掉落: emit 'yellow_crystal_dropped' (不走 monster_killed)
 *   - 用途: 仅任务需要 (例如给 Amber 5 个升级稿子), 不作主货币
 *
 * 用法:
 *   const ore = new YCrystalBlock(scene, x, y);
 *   ore.takeHit(damage);
 */
class YCrystalBlock {
    static TEXTURES = ['YCrystal_block_1', 'YCrystal_block_2', 'YCrystal_block_3'];
    static YELLOW_TINT = 0xffcc33;

    constructor(scene, x, y, opts = {}) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.hp = opts.hp ?? 12;            // 比蓝水晶稍易碎
        this.dropCount = opts.dropCount ?? 1;
        this.destroyed = false;

        // 随机黄水晶外观 (贴图存在则不染色; 缺失才回退到 mimic_ore_img + 黄 tint)
        const tex = YCrystalBlock.TEXTURES[Math.floor(Math.random() * YCrystalBlock.TEXTURES.length)];
        this._usingFallback = !scene.textures.exists(tex);
        const useTex = this._usingFallback ? 'mimic_ore_img' : tex;
        this.sprite = scene.add.image(x, y, useTex).setScale(1.4);
        if (this._usingFallback) this.sprite.setTint(YCrystalBlock.YELLOW_TINT);

        // 旋转 — 跟蓝水晶同逻辑
        let rotation = opts.rotation;
        if (rotation === undefined && scene.gridSystem) {
            const G = 32;
            const gs = scene.gridSystem;
            const col = Math.floor(x / G);
            const row = Math.floor(y / G);
            const gridCol = col - gs.originX / G;
            const gridRow = row - gs.originY / G;
            const hasWall = (c, r) => gs.getType(c, r) === GridSystem.WALL;
            if (hasWall(gridCol, gridRow + 1)) rotation = 0;
            else if (hasWall(gridCol - 1, gridRow)) rotation = Math.PI / 2;
            else if (hasWall(gridCol + 1, gridRow)) rotation = 3 * Math.PI / 2;
            else if (hasWall(gridCol, gridRow - 1)) rotation = Math.PI;
            else rotation = 0;
        }
        if (rotation) this.sprite.setRotation(rotation);

        // 标记 BLOCK (跟蓝水晶一样, fog 阻挡 + 玩家无法穿过)
        if (scene.gridSystem) {
            scene.gridSystem.markRect(x, y, 32, 32, GridSystem.BLOCK);
        }
    }

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

    takeHit(damage = 3.5) {
        if (this.destroyed) return;
        this.hp -= damage;
        // (用户) 黄/蓝水晶共用音效: 每下敲击 PickaxeHitThings (跟蓝水晶一致)
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'PickaxeHitThings', { volume: 0.6 });
        // 受击闪红 (跟蓝水晶一致)
        this.sprite.setTint(0xff0000);
        this.scene.time.delayedCall(120, () => {
            if (!this.destroyed && this.sprite) {
                if (this._usingFallback) this.sprite.setTint(YCrystalBlock.YELLOW_TINT);
                else this.sprite.clearTint();
            }
        });
        if (this.hp <= 0) this._destroy();
    }

    _destroy() {
        this.destroyed = true;
        this.sprite.setVisible(false);
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'CrystalBreak');  // (用户) 共用蓝水晶破碎音
        if (this.scene.gridSystem) {
            this.scene.gridSystem.unmarkRect(this.x, this.y, 32, 32);
            // (用户) 灰罩通知已按要求撤销 — 碎裂格沿用雾的原始规则
        }
        // 黄水晶掉落事件 — 跟 monster_killed 分开
        this.scene.events.emit('yellow_crystal_dropped', this.x, this.y, this.dropCount);
    }
}
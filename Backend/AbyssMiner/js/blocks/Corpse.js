/**
 * Corpse - 装饰尸体 block
 * 3 个变种:
 *   Corpse1: 59×34
 *   Corpse2: 60×60
 *   Corpse3: 59×60
 * Depth = 10 (低于玩家/hint, 高于神像 -3)
 */
class Corpse {
    constructor(scene, col, row, variant, opts = {}) {
        this.scene = scene;
        const G = 32;
        const x = col * G + G / 2;
        const y = row * G + G / 2 - 15 + (opts.yOffset || 0);  // 上调 15px + 可选 yOffset

        const sizeMap = {
            'corpse1': { w: 59, h: 34, tex: 'Corpse1' },
            'corpse2': { w: 60, h: 60, tex: 'Corpse2' },
            'corpse3': { w: 59, h: 60, tex: 'Corpse3' }
        };
        const info = sizeMap[variant] || sizeMap['corpse1'];

        if (scene.textures.exists(info.tex)) {
            this.sprite = scene.add.image(x, y, info.tex)
                .setDisplaySize(info.w, info.h)
                .setDepth(10);
        } else {
            // fallback — 灰矩形
            this.sprite = scene.add.rectangle(x, y, info.w, info.h, 0x555555, 0.6)
                .setStrokeStyle(1, 0x222222)
                .setDepth(10);
        }

        if (scene.uiCam) {
            try { scene.uiCam.ignore(this.sprite); } catch(e) {}
        }
    }

    destroy() {
        if (this.sprite && this.sprite.destroy) this.sprite.destroy();
    }
}
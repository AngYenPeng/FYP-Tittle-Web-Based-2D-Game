/**
 * Block — 物件基类（影响地形/视觉但分类不是 Wall）
 *
 * Wall 和 Block 是两个不同分类：
 *  - Wall：玩家无法穿透的实体地形（普通墙、CavetileWall）— 在 js/walls/
 *  - Block：视觉/可交互物件（PlatformBlock 单向平台、AirBlock、BackgroundBlock、CrystalBlock 可挖矿）— 在 js/blocks/
 *
 * 封装通用逻辑：
 *  - 视觉 rectangle
 *  - 加入 staticGroup walls（如果适用）
 */
class Block {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x   中心 x
     * @param {number} y   中心 y
     * @param {number} w   宽度
     * @param {number} h   高度
     * @param {number} color  填充色
     */
    constructor(scene, x, y, w, h, color = 0x555555) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;

        this.rect = scene.add.rectangle(x, y, w, h, color);
        scene.walls.add(this.rect);
        scene.wallRects.push(new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h));
    }
}
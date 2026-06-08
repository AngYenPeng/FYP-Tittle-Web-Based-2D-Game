/**
 * Wall — 墙基类
 *
 * 墙是和 Block 完全不同的分类：
 *  - Wall：玩家无法穿透的实体地形（普通墙、CavetileWall）
 *  - Block：影响地形/视觉但不一定挡玩家的物件（PlatformBlock 单向平台、AirBlock、BackgroundBlock、CrystalBlock 可挖矿）
 *
 * 封装通用逻辑：
 *  - 加入 staticGroup walls
 *  - 推 wallRects (用于 ThrowSystem 等射线检测)
 *  - 标记 grid 为 WALL
 *  - 视觉 rectangle
 */
class Wall {
    constructor(scene, x, y, w, h, color = 0x555555) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;

        this.rect = scene.add.rectangle(x, y, w, h, color);
        if (scene.walls) scene.walls.add(this.rect);
        if (scene.wallRects) {
            scene.wallRects.push(new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h));
        }
        if (scene.gridSystem) {
            scene.gridSystem.markRect(x, y, w, h, GridSystem.WALL);
        }
        this.isPlatform = false;
    }
}
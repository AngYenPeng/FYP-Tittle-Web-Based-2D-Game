/**
 * AirBlock — 空气方块
 *
 * 用途：
 *   在已 mark 为 WALL/PLATFORM/DOOR 的格子上"抠洞"，把它改回 AIR。
 *   这样可以在不修改墙壁原始大坐标的情况下细调地形。
 *   例如：rectFromCells(10, 5, 20, 8) 创建一大块墙，
 *         然后 airFromCells(15, 6, 16, 7) 在中间挖一个 2x2 小洞。
 *
 * 行为：
 *   - 没有物理碰撞（不创建 rect 进入 walls 组）
 *   - 不进入 wallRects
 *   - 在 GridSystem 上 mark 为 AIR
 *   - CavetileWall.renderSkins 看到这块是 AIR → 周围墙自动显示边界图案
 *
 * 显示优先级：
 *   - AirBlock 本身没有视觉对象
 *   - 它的"作用"是让周围墙的图案变化（露出空气面）
 *   - 如果以后需要装饰物（草、藤蔓），可以在 AirBlock 位置加装饰精灵 depth 100
 */
class AirBlock {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x   中心 x（像素）
     * @param {number} y   中心 y（像素）
     * @param {number} w   宽度（像素）
     * @param {number} h   高度（像素）
     */
    constructor(scene, x, y, w, h) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;

        if (scene.gridSystem) {
            scene.gridSystem.markRect(x, y, w, h, GridSystem.AIR);
        }

        // 同步从 wallRects 中移除被覆盖的部分（射线检测用）
        if (scene.wallRects) {
            scene.wallRects = scene.wallRects.filter(r => {
                const rxc = r.x + r.width / 2;
                const ryc = r.y + r.height / 2;
                return !(rxc >= x - w / 2 && rxc <= x + w / 2 &&
                         ryc >= y - h / 2 && ryc <= y + h / 2);
            });
        }

        // 关键：从 walls staticGroup 移除物理碰撞 rect（避免"无形墙"挡住玩家）
        if (scene.walls) {
            const toRemove = [];
            scene.walls.getChildren().forEach(rect => {
                // 判断 rect 是否完全在 AirBlock 范围内
                if (rect.x >= x - w / 2 && rect.x <= x + w / 2 &&
                    rect.y >= y - h / 2 && rect.y <= y + h / 2) {
                    toRemove.push(rect);
                }
            });
            toRemove.forEach(rect => rect.destroy());
        }
    }
}
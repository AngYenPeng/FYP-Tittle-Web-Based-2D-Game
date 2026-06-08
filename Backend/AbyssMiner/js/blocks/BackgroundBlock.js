/**
 * BackgroundBlock — 一格背景方块
 *
 * 行为：
 *   - 不挡住玩家（无物理碰撞）
 *   - 不挡住 fog（仍视为 AIR）
 *   - 显示在所有地形方块**后面**，但在主背景图**前面**
 *   - 用作创造模式里铺背景的最小单元
 *
 * 显示层级（depth）：
 *   - 主背景图：    -100
 *   - BackgroundBlock: -50
 *   - Cavetile 皮肤： -5
 *   - 玩家：         10
 *
 * 用法：
 *   new BackgroundBlock(scene, x, y, w, h);
 *   或在创造模式选 BG Block 笔刷右键放置
 */
class BackgroundBlock {
    constructor(scene, x, y, w, h) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;

        // 视觉对象
        this.image = scene.add.image(x, y, 'Background_block');
        this.image.setDepth(-50);
        // 如果图片尺寸不是 32x32，缩放到指定 w×h
        if (this.image.width > 0) {
            this.image.setDisplaySize(w, h);
        }
        // 标记便于创造模式找到删除
        this.image._isBackgroundBlock = true;

        // 让 uiCam ignore（避免镜头粘贴图）
        if (scene.uiCam) {
            try { scene.uiCam.ignore(this.image); } catch(e) {}
        }
    }
}
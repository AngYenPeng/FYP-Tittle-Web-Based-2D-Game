/**
 * PlatformBlock — 单向平台
 * Phaser staticBody.checkCollision 语义：
 *   - up=true 表示玩家从下方撞此 body 被阻挡
 *   - down=true 表示玩家从上方撞此 body 被阻挡（即落到 body 上）
 * 单向平台只阻挡玩家从上方落下 → 只 down=true，up=false
 */
class PlatformBlock extends Block {
    constructor(scene, x, y, w, h) {
        super(scene, x, y, w, h, 0xaa8855);
        if (this.rect.body) {
            this.rect.body.checkCollision.down = false;    // 玩家从下方跳上不阻挡
            this.rect.body.checkCollision.left = false;
            this.rect.body.checkCollision.right = false;
            // checkCollision.up 保留 true → 玩家从上方落下被阻挡（站在平台上）
        }
        this.isPlatform = true;
        this.rect._isPlatform = true;
        if (scene.gridSystem) {
            scene.gridSystem.markRect(x, y, w, h, GridSystem.PLATFORM);
        }
        scene.time.delayedCall(0, () => this._applySkin());
    }

    _applySkin() {
        const scene = this.scene;
        // 再次确保 checkCollision 设置（防止初次设置在某些情况下被覆盖）
        if (this.rect && this.rect.body) {
            this.rect.body.checkCollision.down = false;
            this.rect.body.checkCollision.left = false;
            this.rect.body.checkCollision.right = false;
            this.rect.body.checkCollision.up = true;
        }
        if (!scene || !scene.gridSystem) return;
        const G = 32;
        const grid = scene.gridSystem;
        const col = Math.floor(this.x / G) - Math.floor((grid.originX || 0) / G);
        const row = Math.floor(this.y / G) - Math.floor((grid.originY || 0) / G);

        const leftType = grid.getType(col - 1, row);
        const rightType = grid.getType(col + 1, row);
        const leftIsWall = leftType === GridSystem.WALL || leftType === GridSystem.DOOR;
        const rightIsWall = rightType === GridSystem.WALL || rightType === GridSystem.DOOR;

        let skin;
        if (leftIsWall && rightIsWall) skin = 'Platform_LR';
        else if (leftIsWall) skin = 'Platform_L';
        else if (rightIsWall) skin = 'Platform_R';
        else skin = 'Platform_M';

        if (!scene.textures.exists(skin)) return;
        if (this.rect && this.rect.setAlpha) this.rect.setAlpha(0);

        this.image = scene.add.image(this.x, this.y, skin)
            .setDisplaySize(this.w, this.h)
            .setDepth(-5);

        if (scene.uiCam) {
            try { scene.uiCam.ignore(this.image); } catch(e) {}
        }
    }
}
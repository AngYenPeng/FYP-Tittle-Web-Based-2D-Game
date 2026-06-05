/**
 * CrystalDoor — 水晶门
 * E 键交互，消耗 N 颗水晶打开。打开后变半透明可见。
 */
/**
 * CrystalDoor — 水晶门
 * E 键交互，消耗 N 颗水晶打开。
 */
class CrystalDoor extends Door {
    constructor(scene, x, y, w, h, cost = 1, options = {}) {
        super(scene, x, y, w, h, 0x4488ff, 0x88ccff);
        this.cost = cost;
        this._flipX = !!options.flipX;

        // 显示锁住的图（32×96，对齐 hitbox）
        if (scene.textures.exists('Crystal_door_locked')) {
            this.rect.setAlpha(0);
            this.image = scene.add.image(x, y, 'Crystal_door_locked')
                .setDisplaySize(w, h)
                .setDepth(5);
            if (this._flipX) this.image.setFlipX(true);
        }

        // 注册开门动画 27 帧 64×96
        if (scene.textures.exists('Crystal_door_open') && !scene.anims.exists('crystal_door_open')) {
            scene.anims.create({
                key: 'crystal_door_open',
                frames: scene.anims.generateFrameNumbers('Crystal_door_open', { start: 0, end: 26 }),
                frameRate: 9,  // 27 帧 / 9fps = 3 秒
                repeat: 0
            });
        }
    }

    open() {
        if (this.opened) return;
        this.opened = true;  // 标记 opened 但不立刻 _finalizeOpen
        // 隐藏 fallback 蓝色矩形
        if (this.rect) this.rect.setAlpha(0);

        // 销毁锁住图，改播开门动画 64×96 — 翻转时偏左 16px, 否则偏右 16px
        if (this.image) this.image.destroy();
        if (this.scene.textures.exists('Crystal_door_open')) {
            const offX = this._flipX ? -16 : 16;
            this.image = this.scene.add.sprite(this.x + offX, this.y, 'Crystal_door_open')
                .setDisplaySize(64, 96)
                .setDepth(-10);
            if (this._flipX) this.image.setFlipX(true);
            if (this.scene.uiCam) {
                try { this.scene.uiCam.ignore(this.image); } catch(e) {}
            }
            if (this.scene.anims.exists('crystal_door_open')) {
                if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'CrystalDoorOpen');
                this.image.play('crystal_door_open');
                this.image.once('animationcomplete-crystal_door_open', () => {
                    if (this.image && this.image.scene) {
                        this.image.setFrame(26);  // 永久停在最后一帧
                    }
                });
                // 比动画结束(3秒)提前 1 秒 → 2 秒即可通过
                this.scene.time.delayedCall(2000, () => this._finalizeOpen());
            } else {
                this._finalizeOpen();
            }
        } else {
            this._finalizeOpen();
        }
    }
}
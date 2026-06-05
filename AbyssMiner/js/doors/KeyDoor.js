/**
 * KeyDoor — 钥匙门
 * 三阶段：locked → unlocking 动画 → unlocked → 玩家 E 真正 open
 */
class KeyDoor extends Door {
    constructor(scene, x, y, w, h, options = {}) {
        super(scene, x, y, w, h, 0xffcc00, 0xffee66);
        this.unlocked = false;
        this._flipX = !!options.flipX;

        if (scene.textures.exists('Key_door_locked')) {
            this.rect.setAlpha(0);
            this.image = scene.add.image(x, y, 'Key_door_locked')
                .setDisplaySize(w, h)
                .setDepth(5);
            if (this._flipX) this.image.setFlipX(true);
        }

        // 注册解锁动画
        if (scene.textures.exists('Key_door_unlocking') && !scene.anims.exists('key_door_unlocking')) {
            scene.anims.create({
                key: 'key_door_unlocking',
                frames: scene.anims.generateFrameNumbers('Key_door_unlocking', { start: 0, end: 21 }),
                frameRate: 11,  // 22 帧 / 11fps = 2 秒
                repeat: 0
            });
        }
        // 注册开门动画（6 帧，但只播前 5 帧 0-4，第 6 帧手动 setFrame）
        if (scene.textures.exists('Key_door_open') && !scene.anims.exists('key_door_open')) {
            scene.anims.create({
                key: 'key_door_open',
                frames: scene.anims.generateFrameNumbers('Key_door_open', { start: 0, end: 4 }),
                frameRate: 5 / 3,  // 5 帧 / 3 秒 = 1.67fps
                repeat: 0
            });
        }
    }

    /** 第一阶段：使用钥匙触发解锁动画 → 完成后切到 unlocked 图 */
    useKey() {
        if (this.unlocked || this.opened || this._unlocking) return false;
        this._unlocking = true;  // 守卫: 解锁动画期间再按 E 不会再弹对话/再吃钥匙
        if (!this.scene.anims.exists('key_door_unlocking')) {
            // 没动画 → 直接 unlocked
            this._setUnlockedTexture();
            this.unlocked = true;
            return true;
        }
        // 切换到 sprite 播解锁动画 — 动画 96×96，中心右偏 1 格（32px）
        if (this.image) this.image.destroy();
        const offX = this._flipX ? -32 : 32;  // 翻转时偏左
        this.image = this.scene.add.sprite(this.x + offX, this.y, 'Key_door_unlocking')
            .setDisplaySize(96, 96)
            .setDepth(5);
        if (this._flipX) this.image.setFlipX(true);
        if (this.scene.uiCam) {
            try { this.scene.uiCam.ignore(this.image); } catch(e) {}
        }
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'UnlockWoodenDoor');
        this.image.play('key_door_unlocking');
        this.image.once('animationcomplete-key_door_unlocking', () => {
            this._setUnlockedTexture();
            this.unlocked = true;
        });
        return true;
    }

    _setUnlockedTexture() {
        if (!this.image) return;
        if (this.image.destroy && this.image.scene) {
            this.image.destroy();
            // unlocked 图回到门 hitbox 原位 + 大小（w×h）
            if (this.scene.textures.exists('Key_door_unlocked')) {
                this.image = this.scene.add.image(this.x, this.y, 'Key_door_unlocked')
                    .setDisplaySize(this.w, this.h)
                    .setDepth(5);
                if (this._flipX) this.image.setFlipX(true);
                if (this.scene.uiCam) {
                    try { this.scene.uiCam.ignore(this.image); } catch(e) {}
                }
            }
        }
    }

    /** 第二阶段：玩家 E 时（unlocked=true）真正打开 */
    open() {
        if (this.opened) return;
        this.opened = true;  // 标记 opened 但不立刻 _finalizeOpen
        // 强制隐藏 fallback 黄色矩形
        if (this.rect) this.rect.setAlpha(0);

        // 销毁 unlocked 图，改 sprite 播开门动画 96×96 偏右 1 格
        if (this.image) this.image.destroy();
        if (this.scene.textures.exists('Key_door_open')) {
            const offX = this._flipX ? -32 : 32;
            this.image = this.scene.add.sprite(this.x + offX, this.y, 'Key_door_open')
                .setDisplaySize(96, 96)
                .setDepth(-10);
            if (this._flipX) this.image.setFlipX(true);
            if (this.scene.uiCam) {
                try { this.scene.uiCam.ignore(this.image); } catch(e) {}
            }
            if (this.scene.anims.exists('key_door_open')) {
                this.image.play('key_door_open');
                this.image.once('animationcomplete-key_door_open', () => {
                    if (this.image && this.image.scene) {
                        this.image.setFrame(5);
                    }
                });
            }
            // 开门后 1 秒即可通过 (不等动画播完)
            this.scene.time.delayedCall(1000, () => this._finalizeOpen());
        } else {
            this._finalizeOpen();
        }
    }
}
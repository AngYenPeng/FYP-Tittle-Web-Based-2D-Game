/**
 * StoneRubble — 石堆门
 * 玩家近战攻击 N 下后破坏，3 阶段视觉变化（完整 / 轻碎 / 重碎）
 *
 * 用法：
 *   const stone = new StoneRubble(scene, x, y, w, h, hits);
 *   stone.takeHit();  // 击中
 *   stone.opened     // 是否已破坏
 */
class StoneDoor extends Door {
    constructor(scene, x, y, w, h, hits = 6) {
        super(scene, x, y, w, h, 0x886655, 0xaa8866);
        this.hitsLeft = hits;
        this.maxHits = hits;
        this.stage = 0;  // 0=完整, 1=轻碎, 2=重碎

        // 用图替代矩形 — 显示宽 48 高保持，对齐 hitbox 中心
        if (scene.textures.exists('Stone_door_perfect')) {
            this.rect.setAlpha(0);  // 隐藏 fallback 棕色矩形
            this.image = scene.add.image(x, y, 'Stone_door_perfect')
                .setDisplaySize(32, h)
                .setDepth(5);
            if (scene.uiCam) {
                try { scene.uiCam.ignore(this.image); } catch(e) {}
            }
        }

        // 注册爆开动画 10 帧 96×96 / 1.5 秒 → frameRate ≈ 6.67
        if (scene.textures.exists('Stone_door_breaking') && !scene.anims.exists('stone_door_breaking')) {
            scene.anims.create({
                key: 'stone_door_breaking',
                frames: scene.anims.generateFrameNumbers('Stone_door_breaking', { start: 0, end: 9 }),
                frameRate: 10 / 1.5,  // 10 帧 / 1.5 秒
                repeat: 0
            });
        }
    }

    /** 兼容旧字段：destroyed = opened */
    get destroyed() { return this.opened; }

    takeHit() {
        if (this.opened) return;
        this.hitsLeft--;

        const pct = this.hitsLeft / this.maxHits;
        const newStage = pct > 0.67 ? 0 : pct > 0.34 ? 1 : 2;
        const stageChanged = (newStage !== this.stage);
        if (stageChanged) {
            this.stage = newStage;
        }

        // 切换到 injuried 图
        if (this.image && this.scene.textures.exists('Stone_door_injuried') && this.image.setTexture) {
            this.image.setTexture('Stone_door_injuried');
            this.image.setDisplaySize(32, this.h);
        }

        if (this.hitsLeft <= 0) {
            // 第 6 下 — 先显示 injuried 300ms，然后才进入碎裂动画
            this.scene.time.delayedCall(300, () => {
                if (!this.opened) this.open();
            });
        } else {
            // 普通击 — 120ms 后恢复阶段图
            this.scene.time.delayedCall(120, () => {
                if (this.image && this.image.scene && !this.opened) {
                    this._updateStageImage();
                }
            });
        }
    }

    /** 切换阶段图（perfect / small_crack / more_crack）*/
    _updateStageImage() {
        if (!this.image) return;
        let texKey;
        if (this.stage === 0) texKey = 'Stone_door_perfect';
        else if (this.stage === 1) texKey = 'Stone_door_small_crack';
        else texKey = 'Stone_door_more_crack';
        if (this.scene.textures.exists(texKey) && this.image.setTexture) {
            this.image.setTexture(texKey);
            this.image.setDisplaySize(32, this.h);
        }
    }

    /** 石堆破坏：播 breaking 动画 1.5s → 停在最后一帧 + depth 切到玩家下方 */
    open() {
        if (this.opened) return;
        this.opened = true;

        // 销毁阶段 image，改 sprite 播放 breaking 动画
        if (this.image) this.image.destroy();
        if (this.scene.textures.exists('Stone_door_breaking')) {
            // 动画 96×96，中心向右偏 32
            this.image = this.scene.add.sprite(this.x + 32, this.y, 'Stone_door_breaking')
                .setDisplaySize(96, 96)
                .setDepth(820);  // 高于 fog (810)
            if (this.scene.uiCam) {
                try { this.scene.uiCam.ignore(this.image); } catch(e) {}
            }
            if (this.scene.anims.exists('stone_door_breaking')) {
                if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'StoneDoorBreak');
                this.image.play('stone_door_breaking');
                // 动画完成 → 停在最后一帧 + depth 切低
                this.image.once('animationcomplete-stone_door_breaking', () => {
                    if (this.image && this.image.scene) {
                        this.image.setFrame(9);  // 永久停在最后一帧
                        this.image.setDepth(-10);  // 高于 BG，低于玩家
                    }
                });
            }
        }

        // 1 秒后：移除碰撞 + grid 改 AIR（保留 sprite 在最后一帧, 哪怕动画没播完也可通过）
        this.scene.time.delayedCall(1000, () => {
            if (this.rect) {
                if (this.rect.body) this.rect.body.enable = false;
                if (this.scene.walls) this.scene.walls.remove(this.rect);
                this.rect.destroy();
                this.rect = null;
            }
            if (this.scene.gridSystem) {
                this.scene.gridSystem.unmarkRect(this.x, this.y, this.w, this.h);
            }
            if (this.scene._rebuildWallRects) {
                this.scene._rebuildWallRects();
            }
        });
    }
}
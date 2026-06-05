/**
 * SecretDoor — 传送暗门
 *
 * 行为：
 *   - 3 格宽 × 3 格高（96×96 像素）
 *   - 不挡住玩家走路（**无物理碰撞**）
 *   - 不挡 fog 也不算 BLOCK（视为 AIR）
 *   - 玩家靠近 → 头顶出现 [E] 交互图标
 *   - 玩家按 E → 播放进入动画 → 传送到另一个 SecretDoor
 *
 * 配对规则：
 *   - 每个 SecretDoor 有一个 pairId（数字或字符串）
 *   - 同 pairId 的两个门互相传送
 *   - 如果只有一个门 → 按 E 显示 "This door leads nowhere"
 *
 * 用法：
 *   const door1 = new SecretDoor(scene, 320, 480, { pairId: 'A' });
 *   const door2 = new SecretDoor(scene, 1200, 480, { pairId: 'A' });
 *   // 现在它们互相连接
 *
 * 显示层级：
 *   image depth = -3  （在 Cavetile 皮肤 -5 之上，玩家 10 之下）
 *   E 图标 depth = 500  （高于墙皮，低于 fog）
 */
class SecretDoor {
    static _registry = new Map();  // pairId → [door1, door2, ...]

    constructor(scene, x, y, opts = {}) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.w = opts.w ?? 96;
        this.h = opts.h ?? 96;
        this.pairId = opts.pairId ?? 'default';
        this.locked = opts.locked || false;            // 锁住: 无 E 图标 + 不可交互 (如 boss 死后才解锁)
        this.targetScene = opts.targetScene || null;   // 跨场景传送目标 (无配对门时用; 默认 SafeZone1Scene)

        // 视觉：用 SecretDoor 图片，否则 fallback 灰紫矩形
        const tex = scene.textures.exists('Secret_door') ? 'Secret_door' : null;
        if (tex) {
            this.image = scene.add.image(x, y, tex);
            this.image.setDisplaySize(this.w, this.h);
        } else {
            this.image = scene.add.rectangle(x, y, this.w, this.h, 0x442266, 0.7);
            this.image.setStrokeStyle(2, 0x6644aa);
        }
        this.image.setDepth(-3);

        // E 交互图标
        const iconTex = scene.textures.exists('Trader_interection_icon') ? 'Trader_interection_icon' : null;
        if (iconTex) {
            this.eIcon = scene.add.image(x, y - this.h / 2 - 20, iconTex);
            this.eIcon.setDepth(500).setVisible(false).setScale(1.0);
        } else {
            this.eIcon = scene.add.text(x, y - this.h / 2 - 20, '[E]', {
                fontSize: '20px', color: '#ffff66', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(500).setVisible(false);
        }

        // 注册到全局 registry（用于配对）
        if (!SecretDoor._registry.has(this.pairId)) {
            SecretDoor._registry.set(this.pairId, []);
        }
        SecretDoor._registry.get(this.pairId).push(this);

        // 让 uiCam ignore（只在 mainCam 渲染）
        if (scene.uiCam) {
            try {
                scene.uiCam.ignore(this.image);
                scene.uiCam.ignore(this.eIcon);
            } catch(e) {}
        }
    }

    /** 玩家是否在交互范围内 */
    isPlayerNear(player) {
        if (!player) return false;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        return Math.abs(dx) < this.w / 2 + 16 && Math.abs(dy) < this.h / 2 + 16;
    }

    /** 显示/隐藏 E 图标 */
    setHintVisible(visible) {
        if (!this.eIcon) return;
        if (this.locked) visible = false;   // 锁住时强制不显示 E 图标
        if (visible && !this._hintVisible) {
            this._hintVisible = true;
            this.eIcon.setVisible(true);
            this.eIcon.y = this.y - this.h / 2 - 20;
            this._eIconTween = this.scene.tweens.add({
                targets: this.eIcon,
                y: '-=10',
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        } else if (!visible && this._hintVisible) {
            this._hintVisible = false;
            this.eIcon.setVisible(false);
            this.scene.tweens.killTweensOf(this.eIcon);
            this._eIconTween = null;
        }
    }

    /** 玩家按 E：弹对话框问是否传送 */
    interact(player) {
        const scene = this.scene;
        if (this.locked) return;             // 锁住时按 E 无反应
        if (scene._teleporting) return;
        // 没 dialogSystem → fallback 直接传送
        if (!scene.dialogSystem || !scene.dialogSystem.show) {
            this._doTeleport(player);
            return;
        }

        // 判断方向：有配对门 → "next/back"; 在 SafeZone1 → 提示返回 Tutorial; 在 Tutorial → 进入下一关
        const partners = SecretDoor._registry.get(this.pairId) || [];
        const target = partners.find(d => d !== this && !d._destroyed);
        // 根据 scene 决定问句
        const isInSafeZone = scene.scene && scene.scene.key === 'SafeZone1Scene';
        const question = isInSafeZone
            ? 'Return to the previous area?'
            : 'Proceed to the next area?';
        const speaker = '???';

        scene.dialogSystem.show({
            speaker: speaker,
            text: question,
            choices: [
                {
                    label: 'Yes',
                    action: () => {
                        scene.dialogSystem.close();
                        this._doTeleport(player);
                    }
                },
                {
                    label: 'No',
                    action: () => {
                        scene.dialogSystem.close();
                    }
                }
            ]
        });
    }

    /** 真正执行传送 */
    _doTeleport(player) {
        const partners = SecretDoor._registry.get(this.pairId) || [];
        const target = partners.find(d => d !== this && !d._destroyed);
        if (!target) {
            // 没配对 → 跳到下一个 scene（SafeZone1Scene）
            this._teleportToGameScene(player);
            return;
        }
        this._teleportPlayer(player, target);
    }

    _teleportToGameScene(player) {
        const scene = this.scene;
        if (scene._teleporting) return;
        scene._teleporting = true;
        scene._cinematicLock = true;
        scene.cameras.main.fadeOut(800, 0, 0, 0);
        const targetScene = this.targetScene || 'SafeZone1Scene';
        scene.time.delayedCall(900, () => {
            // Tutorial → SZ1 特例: 标记教程完成 + 解锁第一区
            if (targetScene === 'SafeZone1Scene') {
                try {
                    const save = JSON.parse(localStorage.getItem('abyssMinerSave') || '{}');
                    save.tutorialCompleted = true;
                    save.sectorsUnlocked = save.sectorsUnlocked || [true, false, false, false, false, false, false];
                    localStorage.setItem('abyssMinerSave', JSON.stringify(save));
                } catch {}
            }

            // 收集要传给目标场景的状态 (晶体 / 背包 / 血 / 爱心 / 侵蚀度)
            const data = {};
            if (scene.hudSystem) {
                data.crystalCount = scene.hudSystem.crystalCount || 0;
            }
            if (scene.inventorySystem && scene.inventorySystem.slots) {
                data.inventorySlots = scene.inventorySystem.slots.map(s => s ? { ...s } : null);
            }
            if (scene.healthSystem) {
                data.hp = scene.healthSystem.hp;
                data.hearts = scene.healthSystem.hearts;
            }
            if (scene.diseaseSystem) data.corrosionPct = scene.diseaseSystem.corrosionPct;

            scene.scene.start(targetScene, data);
        });
    }

    _teleportPlayer(player, target) {
        const scene = this.scene;
        if (scene._teleporting) return;  // 防止重复触发
        scene._teleporting = true;

        // 隐藏 E 图标
        this.setHintVisible(false);
        target.setHintVisible(false);

        // 暂停玩家移动
        scene._creativeInvincible = true;  // 复用无敌标志
        if (player.body) player.body.setVelocity(0, 0);

        // 1. 玩家缩小淡出（进入门）
        scene.tweens.add({
            targets: player,
            scale: 0.3,
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
                // 2. 黑屏过渡
                scene.cameras.main.fadeOut(200, 0, 0, 0);
                scene.time.delayedCall(220, () => {
                    // 3. 移动玩家到目标门位置
                    player.setPosition(target.x, target.y);
                    if (player.body) player.body.setVelocity(0, 0);
                    // 4. 淡入 + 玩家恢复
                    scene.cameras.main.fadeIn(300, 0, 0, 0);
                    scene.tweens.add({
                        targets: player,
                        scale: 1,
                        alpha: 1,
                        duration: 400,
                        ease: 'Power2',
                        onComplete: () => {
                            scene._teleporting = false;
                            scene._creativeInvincible = false;
                        }
                    });
                });
            }
        });
    }

    destroy() {
        this._destroyed = true;
        if (this.image) this.image.destroy();
        if (this.eIcon) this.eIcon.destroy();
        // 从 registry 移除
        const list = SecretDoor._registry.get(this.pairId);
        if (list) {
            const idx = list.indexOf(this);
            if (idx >= 0) list.splice(idx, 1);
        }
    }
}
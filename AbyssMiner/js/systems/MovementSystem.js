class MovementSystem {
    constructor(scene) {
        this.scene = scene;
    }

    update(time, delta) {
        const s = this.scene;

        // 稿子每帧更新 (飞行旋转/钉墙定角/极限定向/收回朝向) — 放最顶, 对话/菜单开着也照转
        if (s.player) {
            if (s.pick1 && s.pick1.update) s.pick1.update(s.player);
            if (s.pick2 && s.pick2.update) s.pick2.update(s.player);
        }

        // ── (用户) 动作音效: 落地 + 脚步循环 (共享系统 → tutorial/sz1-5/25/主矿洞 全场景生效) ──
        if (s.player && s.player.body && typeof AudioSystem !== 'undefined') {
            const _b = s.player.body;
            const _grounded = _b.blocked.down || _b.touching.down;
            if (!_grounded && _b.velocity.y > 0 && s._fallStartY == null) s._fallStartY = s.player.y;   // (用户) 记录下落顶点
            if (_grounded && s._wasAirborne) {
                // (用户) 落地音量按下落高度分级: ≥3格 100% / ≥2格 66% / ≥1格 33% / <1格 不响; 再乘设置音量
                const _drop = (s._fallStartY != null) ? (s.player.y - s._fallStartY) / 32 : 0;
                const _tier = _drop >= 3 ? 1.0 : (_drop >= 2 ? 0.66 : (_drop >= 1 ? 0.33 : 0));
                if (_tier > 0) AudioSystem.sfx(s, 'JumpLanding', { volume: AudioSystem.sfxVolume * _tier });
            }
            if (_grounded) s._fallStartY = null;
            s._wasAirborne = !_grounded;
            const _movingX = _grounded && Math.abs(_b.velocity.x) > 40 && !s.isDead;
            const _wantKey = _movingX ? (s.isCrouching ? 'CrouchWalking' : 'Walking') : null;
            if (s._stepKey !== _wantKey) {
                if (s._stepSnd) { try { s._stepSnd.stop(); s._stepSnd.destroy(); } catch (e) {} s._stepSnd = null; }
                s._stepKey = _wantKey;
                if (_wantKey && s.cache.audio.exists(_wantKey)) {
                    try {
                        s._stepSnd = s.sound.add(_wantKey, { loop: true, volume: AudioSystem.sfxVolume * 1.8 });   // (用户) 走路音效放大 3 倍
                        s._stepSnd.play();
                        s.events.once('shutdown', () => { if (s._stepSnd) { try { s._stepSnd.stop(); s._stepSnd.destroy(); } catch (e) {} s._stepSnd = null; s._stepKey = null; } });
                    } catch (e) {}
                }
            }
        }

        // 如果商店、确认框开着或玩家死亡，完全不处理移动
        if (s.isDead) return;
        if (s.shopSystem && s.shopSystem.isOpen) return;
        if (s.hudSystem && s.hudSystem.gamePausedByConfirm) return;
        // 开场剧情期间锁定输入
        if (s._cinematicLock) {
            if (s.player && s.player.body) s.player.body.setVelocityX(0);
            return;
        }
        // 对话期间锁定输入 + 强制站立 (不要保持奔跑帧)
        if (s.dialogSystem && s.dialogSystem.isOpen) {
            if (s.player && s.player.body) s.player.body.setVelocityX(0);
            if (s.player && s.player.play && s.anims && s.anims.exists('idle')) {
                s.player.play('idle', true);
            }
            return;
        }
        // 告示牌打开时锁定
        if (s._signpostOpen) {
            if (s.player && s.player.body) s.player.body.setVelocityX(0);
            return;
        }
        // 背包 / 设定 打开锁移动；creative 允许移动
        if (s.backpackSystem?.isOpen || s.settingsSystem?.isOpen) {
            if (s.player && s.player.body) s.player.body.setVelocityX(0);
            return;
        }

        // === 创造模式飞行: 只跑 player.update (WASD 处理), 跳过跳/蹲/冲/挂 ===
        if (s._creativeFly) {
            if (s.player) s.player.update(time, delta);
            return;
        }

        let currentXOffset = s.player.flipX ? 56 : 40;
        let onGround = s.player.body.blocked.down || s.player.body.touching.down;

        // 兜底：贴墙时 Phaser blocked.down 可能漏判，用 wallRects 测脚下 2px
        if (!onGround && s.wallRects) {
            const bx = s.player.body.x;
            const by = s.player.body.y + s.player.body.height;
            const bw = s.player.body.width;
            const footRect = new Phaser.Geom.Rectangle(bx + 2, by, bw - 4, 2);
            for (let w of s.wallRects) {
                if (Phaser.Geom.Intersects.RectangleToRectangle(footRect, w)) {
                    onGround = true;
                    break;
                }
            }
        }

        // 跳跃键 = SPACE
        let jumpPressed = Phaser.Input.Keyboard.JustDown(s.keyJump);
        // 蜘蛛 cling penalty: 每只贴身蜘蛛 → 跳跃力 × 0.9
        const clingCount = s._clingingSpiderCount || 0;
        const jumpForce = -725 * Math.pow(0.9, clingCount);

        if (jumpPressed) {
            if (s.isHanging) {
                if (s.isCrouching) {
                    s.isCrouching = false;
                    s.player.body.setSize(32, 64);
                    s.player.body.setOffset(currentXOffset, 45);
                }
                s.isHanging = false;
                s.isGrappling = false;
                s.grappleSystem.hasSnapped = false;
                s.player.body.setAllowGravity(true);
                s.player.body.checkCollision.none = false;
                s.player.setVelocityY(jumpForce); if (typeof AudioSystem !== 'undefined') AudioSystem.jumpSfx(s);
                if (s.activeGrapplePick) {
                    s.recallSystem.startRecall(s.activeGrapplePick);
                    s.activeGrapplePick = null;
                }
            }
            else if (onGround) {
                if (s.isCrouching) {
                    let headSpaceRect = new Phaser.Geom.Rectangle(
                        s.player.body.x + 2, s.player.body.y - 30, 28, 30
                    );
                    let canStand = true;
                    for (let w of s.wallRects) {
                        if (Phaser.Geom.Intersects.RectangleToRectangle(headSpaceRect, w)) { canStand = false; break; }
                    }
                    if (canStand) {
                        s.isCrouching = false;
                        s.player.body.setSize(32, 64);
                        s.player.body.setOffset(currentXOffset, 45);
                        s.player.y -= 16;
                        s.player.setVelocityY(jumpForce); if (typeof AudioSystem !== 'undefined') AudioSystem.jumpSfx(s);
                    }
                } else {
                    s.player.setVelocityY(jumpForce); if (typeof AudioSystem !== 'undefined') AudioSystem.jumpSfx(s);
                }
            }
        }

        // 蹲下键 = CTRL/S（也用于站在 platform 上时下穿）
        if (Phaser.Input.Keyboard.JustDown(s.keyCrouch)) {
            // 站在 platform 上 + 不在蹲下 + 按 S → 下穿
            if (!s.isCrouching && onGround && this._isStandingOnPlatform(s)) {
                this._dropThroughPlatform(s);
                return;
            }
            if (s.isCrouching) {
                if (onGround) {
                    let headSpaceRect = new Phaser.Geom.Rectangle(
                        s.player.body.x + 2, s.player.body.y - 30, 28, 30
                    );
                    let canStand = true;
                    for (let w of s.wallRects) {
                        if (Phaser.Geom.Intersects.RectangleToRectangle(headSpaceRect, w)) { canStand = false; break; }
                    }
                    if (canStand) {
                        s.isCrouching = false;
                        s.player.body.setSize(32, 64);
                        s.player.body.setOffset(currentXOffset, 45);
                        s.player.y -= 16;
                    }
                } else {
                    // 空中/悬挂起立：放射状安全点搜寻
                    s.isCrouching = false;
                    s.player.body.setSize(32, 64);
                    s.player.body.setOffset(currentXOffset, 45);
                    let isSafe = (cx, cy) => {
                        let bodyLeft = cx - 64 + currentXOffset;
                        let bodyTop  = cy - 64 + 45;
                        let testRect = new Phaser.Geom.Rectangle(bodyLeft, bodyTop, 32, 64);
                        for (let w of s.wallRects) {
                            if (Phaser.Geom.Intersects.RectangleToRectangle(testRect, w)) return false;
                        }
                        return true;
                    };
                    if (!isSafe(s.player.x, s.player.y)) {
                        let maxR = 150, stepR = 4, angleStep = Math.PI / 8;
                        for (let r = stepR; r <= maxR; r += stepR) {
                            let found = false;
                            for (let a = 0; a < Math.PI * 2; a += angleStep) {
                                let tx = s.player.x + Math.cos(a) * r;
                                let ty = s.player.y + Math.sin(a) * r;
                                if (isSafe(tx, ty)) { s.player.setPosition(tx, ty); found = true; break; }
                            }
                            if (found) break;
                        }
                    }
                }
            } else {
                s.isCrouching = true;
                s.player.body.setSize(32, 48);
                s.player.body.setOffset(currentXOffset, 45 + 16); // body 顶部往下移 16，让脚和原本的位置对齐
                if (onGround) s.player.y += 16;
            }
        }

        // 换手键 = F (需 pickaxeUpgraded — Amber 任务完成后解锁)
        if (Phaser.Input.Keyboard.JustDown(s.keyF) && s._pickaxeUpgraded) {
            if (s.inventorySystem) {
                s.inventorySystem.toggleHand();
            } else if (s.player.pState) {
                s.player.pState.activeHand = s.player.pState.activeHand === 'left' ? 'right' : 'left';
            }
            // 换手后立即中断蓄力
            s.isCharging = false; s.chargeTime = 0;
        }

        if (!s.isHanging) {
            // 冲刺键 = SHIFT
            if (Phaser.Input.Keyboard.JustDown(s.keyShift)) {
                let dashDir = s.player.flipX ? 'left' : 'right';
                s.dashSystem.executeDash(dashDir);
            }
            if (!s.isDashing) {
                s.player.update(time, delta);
                if (s.isCrouching && !s.isGrappling) s.player.body.velocity.x *= 0.5;
            }
        } else {
            s.player.update(time, delta);
            s.player.body.setVelocity(0, 0);
            s.player.body.setAllowGravity(false);
        }

        // BatBoss 风冲击波击退: 叠加到玩家水平速度 (顶着走可抵消, 站着被吹后退)
        // 冲刺时跳过 — 冲刺 1600 + 风 450 = 34px/帧 > 32px 墙会穿墙/推超远
        if (s._windKnockVx && !s.isDashing && !s.isGrappling && s.player && s.player.body) {   // (用户) 滑索/摆荡中击退不生效 — 不再打断飞向稿子
            // (用户 bug 修复) 旧版 velocity.x += 每帧累加: 落地时移动代码每帧重写 velocityX 所以正常,
            // 但空中(跳跃/与 boss 重叠)没人重写 → 450/帧滚雪球到上千速度 → 隧穿墙体飞出世界十几格.
            // 改为"顶到击退速度"且不超过: 反向输入照样抵消, 空中恒定 450px/s (7.5px/帧, 不可能穿 32px 墙)
            const v = s.player.body.velocity;
            const k = s._windKnockVx;
            if (k > 0 && v.x < k)      v.x = Math.min(v.x + k, k);
            else if (k < 0 && v.x > k) v.x = Math.max(v.x + k, k);
        }
    }

    /** 玩家是否站在 platform（单向平台）顶上？ */
    _isStandingOnPlatform(s) {
        if (!s.player.body.blocked.down && !s.player.body.touching.down) return false;
        const playerBottom = s.player.body.y + s.player.body.height;
        const px = s.player.x;
        const list = s.walls.getChildren();
        for (const w of list) {
            if (!w._isPlatform || !w.body) continue;
            const top  = w.body.y;
            const left = w.body.x;
            const right = w.body.x + w.body.width;
            if (px >= left - 16 && px <= right + 16 && Math.abs(playerBottom - top) <= 4) {
                return true;
            }
        }
        return false;
    }

    /** 让玩家从平台下穿：临时关闭 up 碰撞 220ms（玩家从上方落下不被平台阻挡）*/
    _dropThroughPlatform(s) {
        const list = s.walls.getChildren();
        const restored = [];
        for (const w of list) {
            if (w._isPlatform && w.body) {
                w.body.checkCollision.up = false;  // 暂时让玩家从上方落下穿过
                restored.push(w);
            }
        }
        s.player.body.setVelocityY(40);
        s.time.delayedCall(220, () => {
            for (const w of restored) {
                if (w.body) w.body.checkCollision.up = true;
            }
        });
    }
}
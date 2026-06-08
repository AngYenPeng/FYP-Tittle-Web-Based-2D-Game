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
                if (_drop > 3 && s._petSpider && s._petSpider.state === 'mounted') s._petSpider.dismount();   // (用户) 落地 >3 格 → 宠物从头顶掉下
            }
            if (_grounded) s._fallStartY = null;
            s._wasAirborne = !_grounded;
            // (用户) 宠物蜘蛛: 懒生成 + 驱动 (买过彩蛋后所有场景自动跟随; 场景重建后自动重生)
            if (s.registry && s.registry.get('hasPetSpider') && typeof PetSpider !== 'undefined') {
                if (!s._petSpider || !s._petSpider.scene || !s._petSpider.body) s._petSpider = new PetSpider(s, s.player.x, s.player.y);
                s._petSpider.update(time, delta);
            }
            const _movingX = _grounded && Math.abs(_b.velocity.x) > 40 && !s.isDead;
            // (用户) 踩 yellowdirt → 草地脚步声; 原皮 wall/platform → 旧音效
            let _onYellow = false;
            if (s._sz3YellowSet && s.player && s.player.body) {
                const _fx = Math.floor(s.player.x / 32) * 32 + 16;
                const _fy = Math.floor((s.player.body.bottom + 2) / 32) * 32 + 16;
                _onYellow = s._sz3YellowSet.has(_fx + ',' + _fy);
            }
            // (用户) 剧情强制走位: s._forceStepKey 置键则借用本循环轨 (tween 走位 velocity=0, _movingX 失效)
            const _wantKey = s._forceStepKey || (_movingX ? (s.isCrouching ? (_onYellow ? 'GrassCrouch' : 'CrouchWalking') : (_onYellow ? 'GrassRun' : 'Walking')) : null);
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
            // (用户) 修穿模: 近战是 192px 帧 + 专用 offset, 攻击瞬间按交互开对话时
            //   这里每帧硬切 idle(128px) 会让 body 横移怼进面前的墙 → 分离失败坠出世界.
            //   与 DialogSystem.show 同规: 只有 run / crouch (且着地) 才切 idle,
            //   melee_attack 交给 MeleeSystem 自己的 delayedCall 收尾 (对话期间照常运行).
            const _k = (s.player && s.player.anims && s.player.anims.currentAnim) ? s.player.anims.currentAnim.key : '';
            if (s.player && s.player.play && s.anims && s.anims.exists('idle') &&
                (_k === 'run' || _k === 'crouch') &&
                s.player.body && (s.player.body.blocked.down || s.player.body.touching.down)) {
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

        let currentXOffset = 48;   // (用户) X 居中统一 — 转身零位移
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

        // (用户·双箱制) 头部实体: 站立时本体顶上的 32×16 手工碰撞 (顶头清 vy / 侧闯退回)
        if (!s.isCrouching && s.wallRects && s.wallRects.length) this._headSolidCheck(s);

        // (用户) 跳跃键 = SPACE 或 W — 共用同一路径; 两个 JustDown 都显式消费, 防同帧双按残留边沿下帧再触发
        const _jdSpace = Phaser.Input.Keyboard.JustDown(s.keyJump);
        const _jdW = s.keyJumpW ? Phaser.Input.Keyboard.JustDown(s.keyJumpW) : false;
        let jumpPressed = _jdSpace || _jdW;
        // 蜘蛛 cling penalty: 每只贴身蜘蛛 → 跳跃力 × 0.9
        const clingCount = s._clingingSpiderCount || 0;
        const jumpForce = -725 * Math.pow(0.9, clingCount);

        if (jumpPressed) {
            if (s.isHanging) {
                // (用户) 蹲着挂镐起跳: 保持蹲姿, 不站起 (与蹲跳一致)
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
                // (用户) 蹲着跳: 保持蹲姿起跳, 不站起 (蹲态本体 32×48 不变 + 头实体停用, 无需头顶净空)
                s.player.setVelocityY(jumpForce); if (typeof AudioSystem !== 'undefined') AudioSystem.jumpSfx(s);
            }
        }

        // 蹲下键 = CTRL/S（也用于站在 platform 上时下穿）
        if (Phaser.Input.Keyboard.JustDown(s.keyCrouch)) {
            // (用户) 蹲下立即打断攻击/冲刺: 先走各自的完整复原原语 (cancelMelee 复帧+offset;
            //   cancelDash 复 origin/offset/重力/守卫), 状态干净后照常蹲下.
            //   旧的"冲刺中禁蹲"门随之撤销 — 当年禁是因为没有安全复原, 现在有了.
            if (s.isMeleeAttacking && s.meleeSystem && s.meleeSystem.cancelMelee) s.meleeSystem.cancelMelee();
            if (s.isDashing && s.dashSystem && s.dashSystem.cancelDash) s.dashSystem.cancelDash();
            // 站在 platform 上 + 不在蹲下 + 按 S → 下穿
            if (!s.isCrouching && onGround && this._isStandingOnPlatform(s)) {
                this._dropThroughPlatform(s);
                return;
            }
            if (s.isCrouching) {
                // (用户·双箱制) 站起 = 头区净空即可, 地面/空中同一规则;
                //   旧的变形三连 + 放射状安全点搜寻随变形机制一并退役
                if (this._headZoneFree(s)) { s.isCrouching = false; s.player.y -= 16; }   // (用户) 贴图归位
            } else {
                s.isCrouching = true;   // 蹲下 = 头实体停用, 本体 32×48 纹丝不动
                s.player.y += 16;        // (用户) 蹲姿贴图下移 16 — offsetY 由 Player 每帧按蹲站写 47/63, 底边恒 y+47
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
    /** (用户·双箱制) 头部与主体完全同源的实墙判定 — 直接读物理组活体 (s.walls 子节点 body):
     *  无 body / body 已禁用 / checkCollision.none / 单向平台 一律跳过.
     *  门开 (无论是销毁还是禁用)、挖矿移除、任何运行时墙体变化 — 引擎放主体过的, 头同步放行.
     *  禁止再用 wallRects 快照: 它是手工维护的死账, 各场景开门筛漏一次头就被幽灵墙挡一次. */
    _headHitWall(s, hx, hy, hw, hh) {
        // (用户) 同源总闸: 主体处于幽灵态 (抓钩飞行/创造穿墙 checkCollision.none) 时, 头同步失效 —
        //   主体穿墙头却顶墙 = 又一处分歧, 一并堵死
        if (s.player.body.checkCollision.none) return null;
        if (!s.walls || !s.walls.getChildren) return null;
        for (const c of s.walls.getChildren()) {
            const wb = c.body;
            if (!wb || !wb.enable || wb.checkCollision.none || c._isPlatform) continue;
            if (hx < wb.x + wb.width && hx + hw > wb.x && hy < wb.y + wb.height && hy + hh > wb.y) return wb;
        }
        return null;
    }

    /** (用户·双箱制) 头区(本体顶上 32×16)是否净空 — 站起资格 */
    _headZoneFree(s) {
        const b = s.player.body;
        return !this._headHitWall(s, b.x + 1, b.y - 16, b.width - 2, 16);
    }

    /** (用户·双箱制) 头部实体碰撞: 顶头 → vy 清零 + 下压让位; 侧闯 48px 缝 → 水平退回.
     *  只动精灵 (本体由引擎下帧跟随), 16px 浅区一帧解一墙足够 */
    _headSolidCheck(s) {
        const b = s.player.body;
        const hx = b.x, hy = b.y - 16, hw = b.width, hh = 16;
        const wb = this._headHitWall(s, hx, hy, hw, hh);
        if (!wb) return;
        const fromBelow = (wb.y + wb.height) - hy;
        const fromLeft  = (wb.x + wb.width) - hx;
        const fromRight = (hx + hw) - wb.x;
        if (fromBelow <= Math.min(fromLeft, fromRight) + 8) {
            if (b.velocity.y < 0) b.velocity.y = 0;   // 顶头
            s.player.y += fromBelow;
        } else if (fromLeft < fromRight) {
            s.player.x += fromLeft;
            if (b.velocity.x < 0) b.velocity.x = 0;
        } else {
            s.player.x -= fromRight;
            if (b.velocity.x > 0) b.velocity.x = 0;
        }
    }

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
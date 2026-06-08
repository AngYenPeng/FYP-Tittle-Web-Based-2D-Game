/**
 * PetSpider — 宠物小蜘蛛 ((用户) 宠物系统)
 * 商店购买 "Mysterious Egg" (399 水晶) 后在玩家脚边孵出, 永久跟随 (跨场景由 MovementSystem 懒生成).
 *
 * 规格:
 *   - 体型 = 普通猎蛛一半 (scale 0.5, 世界 hitbox 16×16)
 *   - 速度 = 普蛛 5 倍: 走 300 (普蛛 60), 爬墙 600 (普蛛 120)
 *   - 同普蛛爬墙系统: 撞墙 → 关重力直上, 翻过沿口小跳落地
 *   - ≤2.5 格停下; >4 格恢复跟随; >10 格强制传送回玩家身上
 *   - 在 2.5 格内且玩家静止满 5s → 爬上头顶; 仅当玩家落地高度 >3 格才掉下来
 *   - 是宠物: 不攻击玩家, 不进任何怪物组 (不可被打/不造成伤害)
 *   - 显示深度 = 玩家深度 + 1 (永远压玩家一头)
 */
class PetSpider extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        const tex = scene.textures.exists('Pet_spider_run') ? 'Pet_spider_run'
                  : (scene.textures.exists('Small_spider_run') ? 'Small_spider_run' : 'spider_img');
        super(scene, x, y, tex);
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setScale(0.5);                 // (用户) 一半体型
        this.body.setSize(32, 32);          // ×0.5 = 世界 16×16
        this.body.setCollideWorldBounds(true);
        this.setDepth((scene.player && scene.player.depth ? scene.player.depth : 600) + 1);   // (用户) 显示优先级大于玩家 (玩家实际 600)

        this.WALK  = 300;                   // (用户) 5× 普蛛走速 60
        this.CLIMB = 600;                   // (用户) 5× 普蛛爬墙速 120
        this.state = 'follow';              // follow / idle / mounted
        this._stillMs = 0;                  // 玩家静止累计 (上头计时)
        this._climbSide = null;

        this._ensurePetAnims();
        if (scene.anims.exists('Pet_spider_run')) { this.play('Pet_spider_run'); }

        // 与地形碰撞 (blocked 检测用)
        try { if (scene.walls)     scene.physics.add.collider(this, scene.walls); } catch (e) {}
        try { if (scene.cavetiles) scene.physics.add.collider(this, scene.cavetiles); } catch (e) {}
        try { if (scene.platforms) scene.physics.add.collider(this, scene.platforms); } catch (e) {}
        if (scene.uiCam) { try { scene.uiCam.ignore(this); } catch (e) {} }

        // (用户) 骑头吸附在 POST_UPDATE 执行 (物理结算后/渲染前) → 读玩家最终坐标, 消除高速跟随延迟
        this._mountSnap = () => this._snapMounted();
        scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this._mountSnap);
        scene.events.once('shutdown', () => { try { scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this._mountSnap); } catch (e) {} });
    }

    /** (用户) 骑头吸附 — 由 update + POST_UPDATE 共用; POST_UPDATE 在物理结算后跑, 彻底贴合无延迟 */
    _snapMounted() {
        if (this.state !== 'mounted') return;
        const p = this.scene && this.scene.player;
        if (!p || !p.body) return;
        const fx = p.flipX ? -1 : 1;            // 面右(flipX=false)→右移; 面左(flipX=true)→左移
        if (this.scene.isCrouching) {
            this.x = p.x + fx * 6;              // 蹲下: 朝向同侧 6px
            this.y = p.y - 22;                  // 蹲下: 比站立位(-16)再上移 6
        } else {
            this.x = p.x;                       // 站立: 居中
            this.y = p.y - 16;                  // 站立: 上移 16px
        }
        this.setFlipX(p.flipX);
    }

    /** (用户) 宠物专用动画用点现注册 — Pet_spider_run / Pet_spider_idle 不在各场景注册簇里, 这里按需建 (帧数随贴图自适应) */
    _ensurePetAnims() {
        const s = this.scene;
        if (!s || !s.anims || !s.textures) return;
        if (!s.anims.exists('Pet_spider_run') && s.textures.exists('Pet_spider_run')) {
            try { const ft = s.textures.get('Pet_spider_run').frameTotal; s.anims.create({ key: 'Pet_spider_run', frames: s.anims.generateFrameNumbers('Pet_spider_run', { start: 0, end: Math.max(0, ft - 2) }), frameRate: 12, repeat: -1 }); } catch (e) {}
        }
        if (!s.anims.exists('Pet_spider_idle') && s.textures.exists('Pet_spider_idle')) {
            try { const ft = s.textures.get('Pet_spider_idle').frameTotal; s.anims.create({ key: 'Pet_spider_idle', frames: s.anims.generateFrameNumbers('Pet_spider_idle', { start: 0, end: Math.max(0, ft - 2) }), frameRate: 8, repeat: -1 }); } catch (e) {}
        }
    }

    /** (用户) 静止姿态: 有 Pet_spider_idle 动画就播, 没有就停在站立帧 */
    _idlePose() {
        if (!this.anims) return;
        this._ensurePetAnims();   // (用户修复) 用点现注册 — 注册簇只在主矿洞 create 跑, SZ/Hub 场景缺
        if (this.scene && this.scene.anims.exists('Pet_spider_idle')) {
            if (!this.anims.currentAnim || this.anims.currentAnim.key !== 'Pet_spider_idle') this.play('Pet_spider_idle');
        } else {
            this.anims.stop();
            this.setFrame(0);
        }
    }

    /** 从头顶掉下来 (仅 MovementSystem 在玩家落地高度 >3 格时调用) */
    dismount() {
        if (this.state !== 'mounted') return;
        this.state = 'follow';
        this.body.enable = true;
        this.body.setAllowGravity(true);
        this.body.setVelocity(0, 0);
        this._stillMs = 0;
    }

    update(time, delta) {
        const s = this.scene, p = s && s.player;
        if (!p || !p.body || !this.body) return;
        const G = 32;

        // ── mounted: 锁在头顶 ──
        if (this.state === 'mounted') {
            this._idlePose();    // (用户) 骑头也用 small_spider_idle 待机动画
            this._snapMounted(); // (用户) 位置吸附 (POST_UPDATE 还会再贴一次, 消延迟)
            return;
        }

        if (this.depth <= p.depth) this.setDepth(p.depth + 1);   // (用户) 深度自愈: 永远 > 玩家
        const dx = p.x - this.x, dy = p.y - this.y;
        const d = Math.hypot(dx, dy);
        const b = this.body;

        // ── >20 格: 强制传送回玩家身上 (宠物不随 mob 距离休眠, 始终跟随; 阈值放远到 20 格) ──
        if (d > 20 * G) {
            b.setVelocity(0, 0);
            this.setPosition(p.x, p.y);   // (用户) 传送位置 = 玩家坐标
            b.setAllowGravity(true);
            this._climbSide = null;
            this.state = 'follow';
            return;
        }

        // ── idle/follow 滞回: ≤2.5 格停, >4 格追 ──
        if (this.state === 'idle' && d > 4 * G) { this.state = 'follow'; this._stillMs = 0; }
        else if (this.state === 'follow' && d <= 2.5 * G) { this.state = 'idle'; }

        if (this.state === 'idle') {
            if (this._climbSide) { this._climbSide = null; b.setAllowGravity(true); }   // 在墙上则自然落地
            b.setVelocityX(0);
            this._idlePose();
            // 玩家站着不动累计 5s → 爬上头
            const pb = p.body;
            const pStill = (pb.blocked.down || pb.touching.down) &&
                           Math.abs(pb.velocity.x) < 5 && Math.abs(pb.velocity.y) < 5;
            this._stillMs = pStill ? this._stillMs + delta : 0;
            if (this._stillMs >= 5000) {
                this.state = 'mounted';
                this._stillMs = 0;
                this._climbSide = null;
                b.enable = false;   // 头顶期间不参与物理
                this._idlePose();   // (用户) 上头后不再动, 只跟随朝向, 掉下来才恢复
            }
            return;
        }

        // ── follow ──
        if (this.anims && this.scene.anims.exists('Pet_spider_run') &&
            (!this.anims.currentAnim || this.anims.currentAnim.key !== 'Pet_spider_run' || !this.anims.isPlaying)) {
            this.play('Pet_spider_run');
        }
        const dir = dx >= 0 ? 1 : -1;
        const wallAhead = (dir > 0 && b.blocked.right) || (dir < 0 && b.blocked.left);

        if (wallAhead || this._climbSide) {
            // 同普蛛: 撞墙 → 关重力直上; 贴墙压力维持 blocked, 翻过沿口小跳落地
            if (wallAhead) this._climbSide = dir > 0 ? 'right' : 'left';
            const stillOnWall = (this._climbSide === 'right' && b.blocked.right) ||
                                (this._climbSide === 'left'  && b.blocked.left);
            if (stillOnWall) {
                b.setAllowGravity(false);
                b.setVelocityY(-this.CLIMB);
                b.setVelocityX(this._climbSide === 'right' ? 30 : -30);
                if (b.blocked.up) {   // 顶到天花板 → 放弃这面墙
                    this._climbSide = null; b.setAllowGravity(true); b.setVelocityY(0);
                }
            } else {
                // 爬过沿口 → 小跳上台
                this._climbSide = null;
                b.setAllowGravity(true);
                b.setVelocityY(-140);
                b.setVelocityX(dir * this.WALK);
            }
        } else {
            b.setAllowGravity(true);
            b.setVelocityX(Math.abs(dx) < 10 ? 0 : dir * this.WALK);   // 正下方近处不抖
        }
        this.setFlipX(dir < 0);
        this.setFlipY(false);
    }
}
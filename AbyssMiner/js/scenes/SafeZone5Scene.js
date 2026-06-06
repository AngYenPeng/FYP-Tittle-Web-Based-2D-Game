/**
 * SafeZone5Scene — 5 号安全区 (占位框架)
 *
 * 提前搭好的空壳, 复制自 SZ2 但删了所有非 spawn 地形 + boss + 实体.
 * 之后要做 SZ5 内容直接在 _applyLevelData 里加.
 */
class SafeZone5Scene extends MainGameScene {

    // 真稿子系统 — 直接定义在场景内 (不依赖 GameScene.js)

    // handlePickCollide 内置 (保底, 不靠继承 GameScene)
    handlePickCollide(pick, id) {
        if (!pick.body) return;
        let dtk = id === 1 ? 'dropTimer1' : 'dropTimer2';
        if (pick.state==='flying_max' || pick.state==='flying_gravity' || pick.state==='dropping') {
            // (用户) 穿墙修正: 高速下 arcade 分离可能把稿子推到墙另一侧(视觉穿墙), 之后绳子拉断才被强制收回.
            // 钉墙前先沿来路(绳子路线)回溯: 上一帧好位置→当前位置 线段扫掠(含空气墙), 命中就拉回墙的近侧表面再钉.
            if (pick._lastCX !== undefined) {
                const bcx = pick.body.center.x, bcy = pick.body.center.y;
                if (Math.hypot(bcx - pick._lastCX, bcy - pick._lastCY) <= 400) {   // 异常长段(传送等)不回溯
                    let wl = this.wallRects;
                    if (this._pickExtraWalls && this._pickExtraWalls.length) {
                        wl = wl.concat(this._pickExtraWalls.filter(w => w && w.body).map(w => w.body));
                    }
                    const bk = CollisionUtils.sweptSegmentVsWalls(pick._lastCX, pick._lastCY, bcx, bcy, wl, 6);
                    if (bk.hit) { pick.body.reset(bk.x, bk.y); pick.x = bk.x; pick.y = bk.y; }
                }
            }
            CollisionUtils.resolvePickWallCollision(pick, this.wallRects);
            // 没有轻重之分了 — 打到墙一律钉住 (不收回)
            pick.state = 'attached'; pick.justAttached = true; pick.ignoreZipFrames = 15;
            pick.body.setVelocity(0,0); pick.body.setAllowGravity(false); pick.clearTint();
            if (this[dtk]) { this[dtk].remove(); this[dtk] = null; }
        }
    }

    _setupRealPickaxes() {
        this.inv = { left: true, right: true };
        this.pick1 = new Pickaxe(this, 0, 0);
        this.pick2 = new Pickaxe(this, 0, 0);
        this.pick1.setCollideWorldBounds(true);
        this.pick2.setCollideWorldBounds(true);
        this.physics.add.collider(this.pick1, this.walls, () => this.handlePickCollide(this.pick1, 1));
        this.physics.add.collider(this.pick2, this.walls, () => this.handlePickCollide(this.pick2, 2));
        // (用户) 已登记的空气墙 → 稿子碰撞器 (空气墙对稿子 = 真墙; 处理"墙先建/稿子后建"的顺序)
        if (this._pickExtraWalls) this._pickExtraWalls.forEach(w => this._addPickWallCollider(w));
        this.ropeNodes1 = []; this.ropeNodes2 = [];
        for (let i = 0; i < 15; i++) {
            this.ropeNodes1.push({x:0,y:0,ox:0,oy:0});
            this.ropeNodes2.push({x:0,y:0,ox:0,oy:0});
        }
        this.physics.add.overlap(this.player, [this.pick1, this.pick2], (p, pick) => {
            if (pick.state === 'dropped' || pick.state === 'returning') this.recallSystem.doCollect(pick);
        });
        if (!this.ropeGraphics) {
            this.ropeGraphics = this.add.graphics().setDepth(650);
            if (this.uiCam) { try { this.uiCam.ignore(this.ropeGraphics); } catch(e) {} }
        }
    }

    _updateRealPickaxes(time, delta) {
        if (!this.pick1 || !this.pick1.body) return;
        if (!this.ropeGraphics) return;
        this.ropeGraphics.clear();
        [this.pick1, this.pick2].forEach((p, index) => {
            if (!p.body) return;
            // CCD 防穿墙: 飞行中扫掠这帧 body 移动线, 穿过墙(含空气墙)就回溯钉在墙面
            if ((p.state === 'flying_max' || p.state === 'flying_gravity' || p.state === 'dropping') && this._sweepPickToWall(p)) {
                this.handlePickCollide(p, index === 0 ? 1 : 2);
            }
            let limit = p.isHeavy ? this.HEAVY_FLY_LIMIT : this.WARNING_DISTANCE;
            let rk  = index === 0 ? 'ropeLength1' : 'ropeLength2';
            let dtk = index === 0 ? 'dropTimer1'  : 'dropTimer2';
            let rtk = index === 0 ? 'retractTimer1' : 'retractTimer2';
            let nodes = index === 0 ? this.ropeNodes1 : this.ropeNodes2;
            let aS = index === 0 ? this.activeStart1 : this.activeStart2;
            let aE = index === 0 ? this.activeEnd1   : this.activeEnd2;
            let iPR = p.state === 'pre_returning', iPZ = p.state === 'pre_zipping';
            let iR = p.state === 'returning', iZ = this.isGrappling && this.activeGrapplePick === p;
            let sd = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);

            if (iPR || iPZ) {
                this[rk] = Math.max(sd, this[rk] - 45000 * (delta/1000));
            } else if (iR || iZ) {
                this[rk] = this.ropePhysics.calculateActualRopeLength(p, aS, aE);
            } else {
                if (p.state === 'attached' || p.state === 'dropping') {
                    let ad = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
                    if (ad > this[rk]) this[rk] = ad;
                    else if (p.state === 'attached') this[rk] = Math.max(ad, this[rk] - 2000 * (delta/1000));
                }
                if ((p.state === 'flying_max' || p.state === 'flying_gravity') && sd > limit) {
                    p.state = 'dropping'; this[rk] = limit; p.body.setAllowGravity(true);
                    p.body.velocity.x *= 0.3; if (p.body.velocity.y < 0) p.body.velocity.y = 0;
                    p.hasBounced = false;
                    this[dtk] = this.time.delayedCall(p.isHeavy ? 3000 : 500, () => {
                        if (p.state === 'dropping' || (p.isHeavy && p.state === 'attached')) this.recallSystem.startRecall(p);
                    });
                }
                if (p.state === 'dropping') {
                    let al = this.ropePhysics.calculateActualRopeLength(p, aS, aE);
                    if (al > limit) {
                        let ax = aS <= aE ? nodes[aE].x : this.player.x;
                        let ay = aS <= aE ? nodes[aE].y : this.player.y;
                        let pa = Phaser.Math.Angle.Between(ax, ay, p.x, p.y);
                        let ov = Math.min(al - limit, Phaser.Math.Distance.Between(ax, ay, p.x, p.y) * 0.8);
                        p.x -= Math.cos(pa) * ov * 0.2; p.y -= Math.sin(pa) * ov * 0.2;
                        let dot = p.body.velocity.x * Math.cos(pa) + p.body.velocity.y * Math.sin(pa);
                        if (dot > 0) { p.body.velocity.x -= dot * Math.cos(pa); p.body.velocity.y -= dot * Math.sin(pa); }
                        p.body.velocity.x *= 0.99; p.body.velocity.y *= 0.99;
                    }
                }
            }

            let ms = this.ropePhysics.processVerletRope(p, index);
            if (!iZ && !iPZ) {
                if (ms > 30 && p.state !== 'idle' && p.state !== 'returning') this.recallSystem.startRecall(p, true);
                if (p.state === 'attached') {
                    let al = this.ropePhysics.calculateActualRopeLength(p, aS, aE);
                    if (p.ignoreZipFrames && p.ignoreZipFrames > 0) {
                        p.ignoreZipFrames--;
                    } else {
                        let ws = this.WARNING_DISTANCE / 16, cs = this.CRITICAL_DISTANCE / 16;
                        if (ms > cs && al > this.CRITICAL_DISTANCE * 0.8 && sd > this.CRITICAL_DISTANCE * 0.4)
                            this.recallSystem.startRecall(p);
                        else if (ms > ws && al > this.WARNING_DISTANCE * 0.8 && sd > this.WARNING_DISTANCE * 0.4) {
                            p.setTint(0xff0000);
                            if (!this[rtk]) this[rtk] = this.time.delayedCall(this.RETRACT_DELAY, () => {
                                if (p.state === 'attached') this.recallSystem.startRecall(p);
                                this[rtk] = null;
                            });
                        } else { p.clearTint(); if (this[rtk]) { this[rtk].remove(); this[rtk] = null; } }
                    }
                } else if (p.state === 'dropping') {
                    if (ms > this.WARNING_DISTANCE / 16) p.setTint(0xff0000); else p.clearTint();
                }
            } else { p.clearTint(); }
        });

        this.grappleSystem.update();
        this.recallSystem.update();
        this.throwSystem.updateUI();
    }


    constructor() {
        super();
        Phaser.Scene.call(this, { key: 'SafeZone5Scene' });
    }

    init(data) {
        this._inheritedData = data || {};
    }

    preload() {
        if (typeof super.preload === 'function') super.preload();
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_SafeZone5');  // BGM (SafeZone5.mp3 放进 BGM/ 即生效)
        // (用户) SZ5 保留物理 hitbox 显示 (全局 debug 已关, 这里单独开)
        // 注: config debug=false 时 body 创建即 debugShowBody=false → 必须改 world.defaults,
        //     且这段在 create 顶部 (墙/玩家创建之前), 之后创建的所有 body 才会画
        try {
            const w = this.physics.world;
            w.drawDebug = true;
            if (!w.debugGraphic) w.createDebugGraphic();
            w.defaults.debugShowBody = true;
            w.defaults.debugShowStaticBody = true;
        } catch (e) {}

        // pickaxeUpgraded — 从 registry 读 (跨场景有效, 刷新网页自动重置 — 暂无后台存档)
        this._pickaxeUpgraded = !!this.registry.get('pickaxeUpgraded');
        // 丢稿子距离极限 (砍短, 防飞出屏幕) — 这里覆盖一次, 不依赖 GameScene.js 构造器
        this.WARNING_DISTANCE = 280; this.HEAVY_FLY_LIMIT = 214; this.CRITICAL_DISTANCE = 380;
        // 节点末索引 (15 节点 → 0..14)
        this.activeEnd1 = 14; this.activeEnd2 = 14;
        // 注册怪物 anim — SZ 场景不调 super.create(), 必须自己 register
        this._registerMonsterAnims();

        const G = 32;
        const W = 1280;
        const H = 720;

        this.physics.world.setBounds(0, 0, W, H);

        // 背景
        if (this.textures.exists('Tutorial_scene_background_image')) {
            this.bg = this.add.image(W / 2, H / 2, 'Tutorial_scene_background_image');
            const bgScale = Math.max(W / this.bg.width, H / this.bg.height);
            this.bg.setScale(bgScale).setScrollFactor(0).setDepth(-100);
        }

        this._initT1State();
        this.input.mouse.disableContextMenu();
        this._registerAnims();

        // 按键
        this.keyJump   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyCrouch = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyF      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keyE      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.keyShift  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.keyR      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.keyESC    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        this.input.keyboard.addCapture([
            Phaser.Input.Keyboard.KeyCodes.SHIFT,
            Phaser.Input.Keyboard.KeyCodes.SPACE,
            Phaser.Input.Keyboard.KeyCodes.F,
            Phaser.Input.Keyboard.KeyCodes.E,
            Phaser.Input.Keyboard.KeyCodes.S,
            Phaser.Input.Keyboard.KeyCodes.R,
            Phaser.Input.Keyboard.KeyCodes.Z,
            Phaser.Input.Keyboard.KeyCodes.X,
            Phaser.Input.Keyboard.KeyCodes.C,
            Phaser.Input.Keyboard.KeyCodes.B,
        ]);

        // GridSystem
        // GridSystem 覆盖含全部扩展区
        // 左 BUF_L=39（砍 col<-39 的部分），右 BUF_R=50, 上下 BUF=20
        const BUF_T = 20, BUF_B = 20, BUF_L = 39, BUF_R = 50;
        // === SZ5 重建: 空白大地图 — 左+50 / 右+300 / 上+150 / 下+150 格 ===
        // (用户) SZ5 砍到只剩出生点 10×10 格: x ∈ [-30,-21], y ∈ [10,19] (出生 (-25,18), 地板 row 19)
        const boundsX = -30 * G;
        const boundsY = 10 * G;
        const boundsW = 10 * G;
        const boundsH = 10 * G;
        this.gridSystem = new GridSystem(this, G, boundsW, boundsH, boundsX, boundsY);

        // 物理组
        this.walls = this.physics.add.staticGroup();
        this.platforms = this.physics.add.staticGroup();
        this.bgBlocks = this.physics.add.staticGroup();
        this.crystalBlocks = this.physics.add.staticGroup();
        this.wallRects = [];
        this.droppedCrystals = this.physics.add.group();
        // 怪物组（creative 模式放置怪物用）
        this.spiders = this.physics.add.group();
        this.bungeeSpiders = this.physics.add.group();
        this.bats = this.physics.add.group();
        this.earthworms = this.physics.add.group();
        this.slimes = this.physics.add.group();
        this.beetles = this.physics.add.group();
        this.mimicOres = this.physics.add.group();
        this.volatileCrystals = this.physics.add.group();

        // 地形
        const G_W = Math.floor(W / G);
        const G_H = Math.floor(H / G);
        const rectFromCells = (x1, y1, x2, y2) => {
            for (let cx = x1; cx <= x2; cx++) {
                for (let cy = y1; cy <= y2; cy++) {
                    new CavetileWall(this, cx * G + G / 2, cy * G + G / 2, G, G);
                }
            }
        };
        const bgFromCells = (x1, y1, x2, y2) => {
            for (let cx = x1; cx <= x2; cx++) {
                for (let cy = y1; cy <= y2; cy++) {
                    new BackgroundBlock(this, cx * G + G / 2, cy * G + G / 2, G, G);
                }
            }
        };
        // === SZ5 重建: 删光所有地形, 只在出生点 (-25,18) 下方放一块小平台 ===
        // 出生点中心 row 18.5 → 平台顶 row 19, 玩家落在上面; 其余全空 (靠世界边界兜底)
        rectFromCells(-30, 19, -21, 19);   // (用户) 10×10 区域底边地板 (1 行通铺 col -30..-21)

        // 应用 level data（来自 creative export）
        this._applyLevelData();

        // 物理边界 = 整张扩展后的空白地图
        this.physics.world.setBounds(boundsX, boundsY, boundsW, boundsH);

        // (用户) 删掉重复的 renderSkins — 这里跑一遍、后面"渲染 CavetileWall 皮肤"又跑一遍,
        //        全图几千面墙的皮肤计算白做一次, 是重进存档卡顿的大头之一 (真正的调用在后面)

        // 网格线（按 R 切换）
        this._gridGraphics = this.add.graphics().setDepth(0);
        this._gridGraphics.lineStyle(1, 0xffffff, 0.15);
        for (let x = boundsX; x <= boundsX + boundsW; x += G) {
            this._gridGraphics.moveTo(x, boundsY);
            this._gridGraphics.lineTo(x, boundsY + boundsH);
        }
        for (let y = boundsY; y <= boundsY + boundsH; y += G) {
            this._gridGraphics.moveTo(boundsX, y);
            this._gridGraphics.lineTo(boundsX + boundsW, y);
        }
        this._gridGraphics.strokePath();
        this._gridGraphics.setVisible(false);

        // Z X C 快捷键
        this.keyZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
        this.keyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);

        // 渲染 CavetileWall 皮肤
        if (typeof CavetileWall !== 'undefined' && CavetileWall.renderSkins) {
            CavetileWall.renderSkins(this);
        }

        // 物理子系统
        this.ropePhysics   = new RopePhysics(this);
        this.dashSystem    = new DashSystem(this);
        this.movementSystem= new MovementSystem(this);
        this.throwSystem   = new ThrowSystem(this);
        this.grappleSystem = new GrappleSystem(this);
        this.recallSystem  = new RecallSystem(this);
        this.meleeSystem   = new MeleeSystem(this);

        // 玩家
        // 出生点：world (-25, 18) 是 SecretDoor 位置 — 玩家从 T1 传送过来后站在它上面
        const spawnX = -25 * G + G / 2;
        const spawnY = 18 * G + G / 2;
        this.spawnX = spawnX;
        this.spawnY = spawnY;
        this.player = new Player(this, spawnX, spawnY);

        // 真稿子系统 (替换 stub) — 右键丢/grapple/换手
        this._setupRealPickaxes();

        // 物理碰撞 — T1 同款（platform 用 checkCollision.down=false 单向）
        this.physics.add.collider(this.player, this.walls);
        this.physics.add.collider(this.droppedCrystals, this.walls);
        // 怪物 ↔ walls
        this.physics.add.collider(this.spiders, this.walls);
        this.physics.add.collider(this.bats, this.walls);
        this.physics.add.collider(this.slimes, this.walls);
        this.physics.add.collider(this.beetles, this.walls);
        this.physics.add.collider(this.earthworms, this.walls);
        this.physics.add.collider(this.mimicOres, this.walls);
        this.physics.add.collider(this.bungeeSpiders, this.walls);
        this.physics.add.collider(this.volatileCrystals, this.walls);

        // 玩家伤害检测（同 T1 写法）
        const dmgCheck = (p, m) => {
            if (m.canDamagePlayer && m.canDamagePlayer()) {
                if (this._playerHit) this._playerHit(p, m);
                if (m.onHitPlayer) m.onHitPlayer();
            }
        };
        this.physics.add.overlap(this.player, this.spiders, dmgCheck);
        this.physics.add.overlap(this.player, this.bats, dmgCheck);
        this.physics.add.overlap(this.player, this.slimes, dmgCheck);
        this.physics.add.overlap(this.player, this.beetles, dmgCheck);
        this.physics.add.overlap(this.player, this.earthworms, dmgCheck);
        this.physics.add.overlap(this.player, this.mimicOres, dmgCheck);
        this.physics.add.overlap(this.player, this.bungeeSpiders, dmgCheck);
        this.physics.add.overlap(this.player, this.volatileCrystals, dmgCheck);

        // UI 系统（同 GameScene 顺序）
        this.healthSystem    = new HealthSystem(this);    this.healthSystem.init();
        this.diseaseSystem   = new DiseaseSystem(this);   this.diseaseSystem.init();
        this.inventorySystem = new BackpackSystem(this);  this.inventorySystem.init();
        this.backpackSystem  = this.inventorySystem;
        this.hudSystem       = new HUDSystem(this);       this.hudSystem.init();
        this.settingsSystem  = new SettingsSystem(this);  this.settingsSystem.init();
        if (typeof CreativeSystem !== 'undefined') {
            this.creativeSystem  = new CreativeSystem(this);  this.creativeSystem.init();
        }
        this.dialogSystem    = new DialogSystem(this);    this.dialogSystem.init();
        if (typeof QuestSystem !== 'undefined') {
            this.questSystem     = new QuestSystem(this);     this.questSystem.init();
        }
        this.guideSystem     = new GuideSystem(this);     this.guideSystem.init();
        if (typeof ShopSystem !== 'undefined') {
            this.shopSystem      = new ShopSystem(this);      this.shopSystem.init();
        }
        this.interactSystem  = new InteractSystem(this);  this.interactSystem.init();

        // (用户) 光影黑雾启用 — 按 gridSystem 原点/尺寸 (负坐标地图 OK)
        // 性能: 跨格才重画 + 墙数据健全后 flood 范围有限, 比之前每帧全图重画轻得多
        if (typeof FogSystem !== 'undefined' && this.gridSystem) {
            const _fg = this.gridSystem;
            this.fogSystem = new FogSystem(this, _fg.cellSize, _fg.cols * _fg.cellSize, _fg.rows * _fg.cellSize, _fg.originX || 0, _fg.originY || 0);
        }

        // 怪物掉落监听
        this.events.on('monster_killed', (mx, my, dropRate) => {
            if (Math.random() <= dropRate) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 5 + Math.random() * 10;
                let targetX = mx + Math.cos(angle) * radius;
                let targetY = my + Math.sin(angle) * radius;
                // 防穿模：检查 targetX,targetY 是否在墙内
                if (this.wallRects) {
                    for (const w of this.wallRects) {
                        if (targetX >= w.left && targetX <= w.right &&
                            targetY >= w.top && targetY <= w.bottom) {
                            targetY = w.top - 1;
                            break;
                        }
                    }
                }
                // 用 Crystal 纹理（fallback drop_crystal_img）
                const tex = this.textures.exists('Crystal') ? 'Crystal' : 'drop_crystal_img';
                const c = this.add.image(mx, my, tex);
                if (tex === 'Crystal') c.setDisplaySize(20, 20);
                c.setDepth(8);
                if (this.uiCam) this.uiCam.ignore(c);
                c._isDroppedCrystal = true;
                c._pickupReadyAt = this.time.now + 500;
                c.active = true;
                this.droppedCrystals.add(c);
                this.tweens.add({ targets: c, x: targetX, duration: 350, ease: 'Linear' });
                // 旋转 360°
                this.tweens.add({ targets: c, angle: 360, duration: 350, ease: 'Linear' });
                const peakY = Math.min(my, targetY) - 30;
                this.tweens.add({
                    targets: c, y: peakY, duration: 175, ease: 'Quad.easeOut',
                    onComplete: () => this.tweens.add({
                        targets: c, y: targetY, duration: 175, ease: 'Quad.easeIn',
                        onComplete: () => { c.angle = 0; }  // 落地后正立
                    })
                });
            }
        });

        // 监听 slime 分裂事件 — 大 Slime 死亡后产生 2 只 mini
        this.events.on('slime_split', (x, y) => {
            for (let i = 0; i < 2; i++) {
                const mini = new CrystalSlime(this, x + (i === 0 ? -20 : 20), y - 10, true);
                this.slimes.add(mini);
                if (mini.setDepth) mini.setDepth(10);
                if (this.uiCam) { try { this.uiCam.ignore(mini); } catch(e) {} }
                this.physics.add.collider(mini, this.walls);
                // mini 不重生（只继承大 slime 的 chunk）
            }
        });

        // 镜头：4 个 chunks
        // zone1（出生区）：(-39, 7) → (0, 29)
        // zone2：左 x=0，右 x=39，上 y=0
        // zone3：左 x=39，右 x=92，上 y=-2，下 y=21.5
        // zone4：左 x=39，右 x=92，下 y=-2 — zone3 上方
        const G_H_FULL = G_H + BUF_B;
        // 9 个 chunks (zone7 跟 6/8/9 一排在上方)
        this._chunks = [
            // (用户) SZ5 10×10: chunk = 正好一个视口 (zoom2 = 20×11.25 格), 居中锁定出生区
            //   宽 (-16+1)−(-35)=20 格=640px, 高 20.625−9.375=11.25 格=360px, 中心 (col -25, row 15)
            { id: 'zone1', x1: -35, y1: 9.375, x2: -16, y2: 19.625 }
        ];
        this._currentChunkId = null;

        // === Mob 透明墙 — 沿每个 chunk 边界 ===
        // 只挡 Mob（玩家可穿过）
        const barrierTh = 4;
        for (const c of this._chunks) {
            const cx1 = c.x1 * G, cx2 = (c.x2 + 1) * G;
            const cy1 = c.y1 * G, cy2 = (c.y2 + 1) * G;
            const w = cx2 - cx1, h = cy2 - cy1;
            new MobWall(this, cx1 + w/2, cy1 - barrierTh/2, w, barrierTh);  // 顶
            new MobWall(this, cx1 + w/2, cy2 + barrierTh/2, w, barrierTh);  // 底
            new MobWall(this, cx1 - barrierTh/2, cy1 + h/2, barrierTh, h);  // 左
            new MobWall(this, cx2 + barrierTh/2, cy1 + h/2, barrierTh, h);  // 右
        }
        // Mob ↔ mobWalls collider
        if (this.mobWalls) {
            ['spiders', 'bats', 'slimes', 'beetles', 'earthworms', 'bungeeSpiders', 'mimicOres', 'volatileCrystals'].forEach(grpName => {
                const grp = this[grpName];
                if (grp) this.physics.add.collider(grp, this.mobWalls);
            });
        }
        this.cameras.main.setZoom(2);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this._updateChunkCamera();  // 初始化镜头到出生 chunk

        // 鼠标
        const cursorTex = this.textures.exists('Mouse_cursor') ? 'Mouse_cursor' : 'crosshair_custom';
        this.crosshair          = this.add.sprite(0, 0, cursorTex).setDepth(999999).setScrollFactor(0);
        { const _p0 = this.input && this.input.activePointer; if (_p0) this.crosshair.setPosition(_p0.x, _p0.y); }   // (用户修复) 创建即归位 — 防地图刚显示时光标在 (0,0) 闪没一瞬
        if (cursorTex !== 'Mouse_cursor') this.crosshair.setTint(0xffff00);
        this.leftHandIndicator  = this.add.sprite(0, 0, 'left_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
        this.rightHandIndicator = this.add.sprite(0, 0, 'right_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
        this.input.on('pointermove', (pointer) => {
            if (!this.crosshair) return;
            this.crosshair.setPosition(pointer.x, pointer.y);
            this.leftHandIndicator.setPosition(pointer.x - 22, pointer.y);
            this.rightHandIndicator.setPosition(pointer.x + 22, pointer.y);
        });
        this.game.canvas.style.cursor = 'none';

        // pointerdown
        this.input.on('pointerdown', (pointer) => {
            if (!this.player.body || this.isPlayerStunned || this.isDead) return;
            if (this._cinematicLock) return;
            if (this.shopSystem?.isOpen || this.hudSystem?.gamePausedByConfirm) return;
            if (this.backpackSystem?.isOpen || this.settingsSystem?.isOpen || this.creativeSystem?.isOpen) return;
            if (this.dialogSystem?.isOpen || this.guideSystem?.isOpen) return;
            if (this._suppressNextClick) {
                this._suppressNextClick = false;
                return;
            }
            if (this._isClickOnHUDButton(pointer)) return;

            let item = this.inventorySystem?.getActiveItem?.();
            let holdingPickaxe = item && item.type === 'pickaxe';
            let side = this.player.pState?.activeHand;
            let pick = side === 'left' ? this.pick1 : this.pick2;

            if (pointer.button === 2) {
                if (holdingPickaxe && this._pickaxeUpgraded) {
                    pick.state === 'idle' ? this.throwSystem.releaseThrow(pointer) : this.recallSystem.startRecall(pick);
                }
            } else if (pointer.button === 0) {
                if (holdingPickaxe && pick.state === 'attached' && this._pickaxeUpgraded) {
                    this.grappleSystem.startZip(pick);
                } else {
                    if (this.meleeSystem.execute()) {
                        this._checkMeleeOnCrystalOres();
                    }
                }
            }
        });

        // UI Camera
        this.cameraSystem = new CameraSystem(this.cameras.main, this.player);
        this.uiCam = this.cameraSystem.setupUICamera(this);

        // 强制 mainCam ignore crosshair（防止 cameraSystem 顺序问题导致双鼠标）
        try {
            this.cameras.main.ignore(this.crosshair);
            this.cameras.main.ignore(this.leftHandIndicator);
            this.cameras.main.ignore(this.rightHandIndicator);
        } catch(e) {}

        // 继承 Tutorial 状态
        this._applyInheritedState();
        if (typeof SaveSystem !== 'undefined') SaveSystem.autoSave(this);   // 进入区域自动存档

        // 进入剧情过渡
        this._cinematicLock = true;
        this.cameras.main.fadeIn(800);
        this.time.delayedCall(900, () => {
            this._cinematicLock = false;
        });
    }

    _applyInheritedState() {
        const data = this._inheritedData || {};
        if (typeof data.crystalCount === 'number' && this.hudSystem) {
            this.hudSystem.crystalCount = data.crystalCount;
            if (this.hudSystem.refreshCrystal) this.hudSystem.refreshCrystal();
        }
        if (data.inventorySlots && this.inventorySystem) {
            for (let i = 0; i < data.inventorySlots.length; i++) {
                this.inventorySystem.slots[i] = data.inventorySlots[i];
            }
            if (this.inventorySystem.refresh) this.inventorySystem.refresh();
        }
        if (this.healthSystem) {
            if (typeof data.maxHp === 'number') this.healthSystem.maxHp = data.maxHp;
            if (typeof data.hp === 'number')    this.healthSystem.hp = data.hp;
            if (typeof data.hearts === 'number') this.healthSystem.hearts = data.hearts;
            if (this.healthSystem.refresh) this.healthSystem.refresh();
        }
        // 健康侦测仪 flag + 激活腐蚀度条
        if (data.hasHealthDetector) {
            this._hasHealthDetector = true;
            if (this.diseaseSystem && this.diseaseSystem.setBarVisible) {
                this.diseaseSystem.setBarVisible(true);
            }
            if (this.hudSystem && this.hudSystem._updateHealthDetectorLayout) {
                this.hudSystem._updateHealthDetectorLayout(true);
            }
        }
        // 腐蚀度进度继承
        if (typeof data.corrosionPct === 'number' && this.diseaseSystem) {
            this.diseaseSystem.corrosionPct = data.corrosionPct;
            if (this.diseaseSystem._updateUI) this.diseaseSystem._updateUI();
        }
    }

    _registerAnims() {
        // 安全注册 — 检查 texture 存在 + 有效 frames
        const safeCreate = (key, textureKey, frameCfg, frameRate, repeat) => {
            if (this.anims.exists(key)) return;
            if (!this.textures.exists(textureKey)) return;
            const frames = this.anims.generateFrameNumbers(textureKey, frameCfg);
            if (!frames || frames.length === 0) {
                console.warn('[anims] no frames for', textureKey, frameCfg);
                return;
            }
            this.anims.create({ key, frames, frameRate, repeat });
        };
        safeCreate('idle',          'Miner_stand',        { start: 0, end: 11 }, 12, -1);
        safeCreate('run',           'Miner_run',          { start: 0, end: 5  }, 12, -1);
        safeCreate('melee_attack',  'Miner_melee_attack', { start: 0, end: 2  }, 20, 0);
        safeCreate('jump',          'Miner_jump',         { start: 0, end: 2  }, 14, 0);
        safeCreate('fall',          'Miner_fall',         { start: 0, end: 2  }, 10, 0);
        safeCreate('crouch',        'Miner_crouch',       { start: 0, end: 5  }, 14, 0);
        safeCreate('crouch_walk',   'Miner_crouch_walk',  { start: 0, end: 9  }, 14, -1);
        safeCreate('trader_stand',  'Trader_stand',       { start: 0, end: 5  }, 8, -1);
        // dash 动画
        safeCreate('dash', 'Miner_dash', { start: 0, end: 3 }, 24, 0);
        safeCreate('melee_attack_slash', 'melee_attack_slash', { start: 0, end: 4 }, 24, 0);

        // 小蜘蛛动画
        if (this.textures.exists('Small_spider_run') && !this.anims.exists('small_spider_run')) {
            this.anims.create({ key: 'small_spider_run', frames: this.anims.generateFrameNumbers('Small_spider_run', { start: 0, end: 3 }), frameRate: 12, repeat: -1 });
        }
        if (this.textures.exists('Small_spider_attack') && !this.anims.exists('small_spider_attack')) {
            this.anims.create({ key: 'small_spider_attack', frames: this.anims.generateFrameNumbers('Small_spider_attack', { start: 0, end: 2 }), frameRate: 14, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_injured') && !this.anims.exists('small_spider_injured')) {
            this.anims.create({ key: 'small_spider_injured', frames: this.anims.generateFrameNumbers('Small_spider_injured', { start: 0, end: 1 }), frameRate: 12, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_dead') && !this.anims.exists('small_spider_dead')) {
            this.anims.create({ key: 'small_spider_dead', frames: this.anims.generateFrameNumbers('Small_spider_dead', { start: 0, end: 0 }), frameRate: 1, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_fall') && !this.anims.exists('small_spider_fall')) {
            this.anims.create({ key: 'small_spider_fall', frames: this.anims.generateFrameNumbers('Small_spider_fall', { start: 0, end: 2 }), frameRate: 12, repeat: -1 });
        }

        // mimic ore 动画
        if (this.textures.exists('Mimic_ore_run') && !this.anims.exists('mimic_ore_run')) {
            const total = this.textures.get('Mimic_ore_run').frameTotal - 2;
            this.anims.create({ key: 'mimic_ore_run', frames: this.anims.generateFrameNumbers('Mimic_ore_run', { start: 0, end: total > 0 ? total : 0 }), frameRate: 10, repeat: -1 });
        }

        // 史莱姆动画
        if (this.textures.exists('Slime_dead') && !this.anims.exists('slime_dead')) {
            this.anims.create({ key: 'slime_dead', frames: this.anims.generateFrameNumbers('Slime_dead', { start: 0, end: 2 }), frameRate: 8, repeat: 0 });
        }
        if (this.textures.exists('Slime_injuried') && !this.anims.exists('slime_injured')) {
            this.anims.create({ key: 'slime_injured', frames: this.anims.generateFrameNumbers('Slime_injuried', { start: 0, end: 1 }), frameRate: 12, repeat: 0 });
        }
        if (this.textures.exists('Slime_jump') && !this.anims.exists('slime_jump')) {
            this.anims.create({ key: 'slime_jump', frames: this.anims.generateFrameNumbers('Slime_jump', { start: 0, end: 2 }), frameRate: 10, repeat: 0 });
        }
        if (this.textures.exists('Slime_fall') && !this.anims.exists('slime_fall')) {
            this.anims.create({ key: 'slime_fall', frames: this.anims.generateFrameNumbers('Slime_fall', { start: 0, end: 3 }), frameRate: 12, repeat: 0 });
        }
        if (this.textures.exists('Slime_attack') && !this.anims.exists('slime_attack')) {
            this.anims.create({ key: 'slime_attack', frames: this.anims.generateFrameNumbers('Slime_attack', { start: 0, end: 2 }), frameRate: 14, repeat: 0 });
        }
    }

    _initT1State() {
        this.lastDashTime = 0; this.dashCooldown = 0;
        this.isDashing = false; this.dashDuration = 120; this.dashSpeed = 1600;
        this.isHanging = false; this.isGrappling = false; this.isCrouching = false;
        this.isPlayerStunned = false; this.isMeleeAttacking = false;
        this.meleeCooldown = 0; this.meleeAttackFlipX = false;
        this.isDead = false;
        this.ropeLength1 = 0; this.ropeLength2 = 0;
    }

    update(time, delta) {
        if (this._uiPaused) return;   // (用户) 设置/guide 打开 → 全场景暂停
        if (!this.player.body) return;

        // Hint + Chest + CrystalNpc update (阶段 1+2+7)
        if (this._hints) this._hints.forEach(h => h.update());
        if (this._chests) this._chests.forEach(c => c.update());
        if (this._crystalNpcs) this._crystalNpcs.forEach(n => n.update());

        // (SZ5: Boss intro 已删 — 占位框架)


        // (SZ5: Golem reset 已删 — 占位框架)




        let paused = this.shopSystem?.isOpen || this.hudSystem?.gamePausedByConfirm;

        if (this.dashCooldown > 0)  this.dashCooldown  -= delta;
        if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

        let pointer = this.input.activePointer;
        if (this.crosshair) this.crosshair.setPosition(pointer.x, pointer.y);
        if (this.leftHandIndicator) this.leftHandIndicator.setPosition(pointer.x - 22, pointer.y);
        if (this.rightHandIndicator) this.rightHandIndicator.setPosition(pointer.x + 22, pointer.y);

        if (this.crosshair) this.crosshair.setVisible(!this._cssCursorOverlap);   // (用户修复) 暂停也用精灵光标; 过场交接重叠期 (CSS 顶上时) 让位防双鼠标

        if (this.healthSystem) this.healthSystem.update(delta);
        if (this.diseaseSystem) this.diseaseSystem.update(delta);
        if (this.interactSystem) this.interactSystem.update();
        if (this.fogSystem) this.fogSystem.update(this.player.x, this.player.y);

        // R 键切换网格
        if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
            if (this._gridGraphics) {
                this._gridGraphics.setVisible(!this._gridGraphics.visible);
            }
        }
        // 中键坐标显示（网格开启时）
        if (this._gridGraphics && this._gridGraphics.visible) {
            const middleDown = this.input.activePointer.middleButtonDown();
            if (middleDown && !this._middleClickPrev) {
                this._gridCoordVisible = !this._gridCoordVisible;
                if (!this._gridCoordVisible && this._gridCoordText) {
                    this._gridCoordText.destroy();
                    this._gridCoordText = null;
                }
            }
            this._middleClickPrev = middleDown;

            if (this._gridCoordVisible) {
                const ptr = this.input.activePointer;
                const cam = this.cameras.main;
                const wx = cam.scrollX + (ptr.x - cam.width / 2) / cam.zoom + cam.width / 2;
                const wy = cam.scrollY + (ptr.y - cam.height / 2) / cam.zoom + cam.height / 2;
                const gx = Math.floor(wx / 32);
                const gy = Math.floor(wy / 32);
                if (!this._gridCoordText) {
                    this._gridCoordText = this.add.text(0, 0, '', {
                        fontSize: '18px', color: '#00ff00',
                        fontFamily: '"VT323", monospace', align: 'center',
                        stroke: '#000', strokeThickness: 3,
                        backgroundColor: '#000000aa',
                        padding: { x: 6, y: 3 }
                    }).setOrigin(0.5).setDepth(900);
                    if (this.uiCam) this.uiCam.ignore(this._gridCoordText);
                }
                this._gridCoordText.setPosition(wx, wy - 24);
                this._gridCoordText.setText(`(${gx}, ${gy})\nworld:(${Math.floor(wx)}, ${Math.floor(wy)})`);
            }
        } else if (this._gridCoordText) {
            this._gridCoordText.destroy();
            this._gridCoordText = null;
            this._gridCoordVisible = false;
        }

        if (paused || this.isDead) return;

        if (!this.isPlayerStunned && this.movementSystem) {
            this.movementSystem.update(time, delta);
        this._updateRealPickaxes(time, delta);
        }

        if (this.backpackSystem) {
            const k = Phaser.Input.Keyboard;
            if (this.keyZ && k.JustDown(this.keyZ)) this.backpackSystem.useQuickSlot(0);
            if (this.keyX && k.JustDown(this.keyX)) this.backpackSystem.useQuickSlot(1);
            if (this.keyC && k.JustDown(this.keyC)) this.backpackSystem.useQuickSlot(2);
            if (this.keyB && k.JustDown(this.keyB)) {
                if (!this.settingsSystem?.isOpen) this.backpackSystem.toggle();
            }
        }
        if (this.keyESC && Phaser.Input.Keyboard.JustDown(this.keyESC)) {
            if (!this.backpackSystem?.isOpen) this.settingsSystem?.toggle();
        }

        if (this.inventorySystem) this.inventorySystem.update(delta);
        if (this.dialogSystem) this.dialogSystem.update();
        if (this.hudSystem && this.hudSystem.updateGuideButton) this.hudSystem.updateGuideButton();
        // 怪物 AI — 用 MainGameScene 共用过滤系统 (距离 20×12 + 跨 chunk)
        this._updateMonstersFiltered(time, delta);
        // chunk 镜头切换
        this._updateChunkCamera();
        // platform guide 触发
        this._checkPlatformGuide();
        // 检查 pending respawns
        this._checkPendingRespawns();
        // checkpoint hint + E 交互
        this._checkCheckpoint();
        // Yellow_dirt 扩散
        this._updateYellowDirtSpread(delta);
        // 水晶磁吸拾取
        if (this.droppedCrystals) {
            this.droppedCrystals.getChildren().forEach(c => {
                if (!c.active) return;
                if (c._pickupReadyAt && this.time.now < c._pickupReadyAt) return;
                if (c._flying) return;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y);
                if (dist <= 160) {
                    c._flying = true;
                    if (c.body) c.body.enable = false;
                    this.tweens.add({
                        targets: c,
                        x: () => this.player.x,
                        y: () => this.player.y,
                        duration: 250,
                        ease: 'Cubic.easeIn',
                        onUpdate: () => { if (c.scale > 0.5) c.scale -= 0.02; },
                        onComplete: () => {
                            c.destroy();
                            if (this.hudSystem) this.hudSystem.addCrystal(1);
                        }
                    });
                }
            });
        }

        // 宝箱掉落物磁吸拾取 (阶段 2)
        if (this._chestDrops && this._chestDrops.length > 0) {
            this._chestDrops = this._chestDrops.filter(d => d && d.active);
            this._chestDrops.forEach(d => {
                if (!d.active || d._flying) return;
                if (d._pickupReadyAt && this.time.now < d._pickupReadyAt) return;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, d.x, d.y);
                if (dist <= 160) {
                    d._flying = true;
                    this.tweens.add({
                        targets: d,
                        x: () => this.player.x,
                        y: () => this.player.y,
                        duration: 250,
                        ease: 'Cubic.easeIn',
                        onUpdate: () => { if (d.scale > 0.5) d.scale -= 0.02; },
                        onComplete: () => {
                            // 根据 kind/type 入库
                            if (d._dropKind === 'crystal') {
                                if (this.hudSystem) this.hudSystem.addCrystal(1);
                            } else if (d._dropKind === 'potion') {
                                const t = d._dropType;
                                if (t === 'life_potion') {
                                    // life_potion 没 Z/X/C 槽, 落地即生效 +1 爱心
                                    if (this.healthSystem) this.healthSystem.addHeart(1);
                                } else if (t === 'healing_potion' || t === 'health_potion') {
                                    // 进 InventorySystem, 自动触发 BackpackSystem.refreshQuick
                                    if (this.inventorySystem) this.inventorySystem.addItem(t, 1);
                                }
                            }
                            d.destroy();
                        }
                    });
                }
            });
        }
    }

    _updateYellowDirtSpread(delta) {
        const sp = this._yellowDirtSpread;
        if (!sp || !sp.active) return;
        sp.radius += (delta / 1000) * 5 * 32;
        const r2 = sp.radius * sp.radius;
        const z2 = this._chunks.find(c => c.id === 'zone2');
        const z2x1 = z2.x1 * 32, z2x2 = (z2.x2 + 1) * 32;
        const z2y1 = z2.y1 * 32, z2y2 = (z2.y2 + 1) * 32;
        if (sp.maxRadius == null) {
            const corners = [
                { x: z2x1, y: z2y1 }, { x: z2x2, y: z2y1 },
                { x: z2x1, y: z2y2 }, { x: z2x2, y: z2y2 }
            ];
            sp.maxRadius = Math.max(...corners.map(c => Math.hypot(c.x - sp.cx, c.y - sp.cy)));
        }
        // 标记坐标（zone2 外的也要染色）
        const markedCells = this._yellowDirtMarkedCells;
        const G = 32;
        const isMarkedPos = (x, y) => {
            for (const [col, row] of markedCells) {
                if (Math.abs(x - (col * G + G / 2)) < 1 && Math.abs(y - (row * G + G / 2)) < 1) return true;
            }
            return false;
        };
        this.children.list.forEach(obj => {
            if (!obj || !obj.texture || !obj.texture.key) return;
            const key = obj.texture.key;
            if (!key.startsWith('Cavetile_wall_')) return;
            const inZone2 = obj.x >= z2x1 && obj.x <= z2x2 && obj.y >= z2y1 && obj.y <= z2y2;
            const isMarked = isMarkedPos(obj.x, obj.y);
            if (!inZone2 && !isMarked) return;
            const dx = obj.x - sp.cx, dy = obj.y - sp.cy;
            if (dx * dx + dy * dy > r2) return;
            const suffix = key.substring('Cavetile_wall_'.length);
            // 神像下方 6 格第一层（col 17~22, row 21）的 _T 皮肤改成 grass_T
            const col = Math.floor(obj.x / G);
            const row = Math.floor(obj.y / G);
            let newKey;
            if (suffix === 'T' && row === 21 && col >= 17 && col <= 22) {
                newKey = 'Yellow_dirt_grass_T';
            } else {
                newKey = 'Yellow_dirt_' + suffix;
            }
            if (this.textures.exists(newKey)) {
                obj.setTexture(newKey);
            }
        });
        if (sp.radius >= sp.maxRadius) {
            sp.active = false;
            this._finalizeYellowDirtSkins();
        }
    }

    /** 扩散结束 — 标记坐标都改成 yellowdirt 对位皮肤（fallback，确保都被染色） */
    _finalizeYellowDirtSkins() {
        const markedCells = this._yellowDirtMarkedCells || [];
        const G = 32;
        for (const [col, row] of markedCells) {
            const cx = col * G + G / 2;
            const cy = row * G + G / 2;
            this.children.list.forEach(obj => {
                if (!obj || !obj.texture || !obj.texture.key) return;
                const key = obj.texture.key;
                if (!key.startsWith('Cavetile_wall_')) return;
                if (Math.abs(obj.x - cx) < 1 && Math.abs(obj.y - cy) < 1) {
                    const suffix = key.substring('Cavetile_wall_'.length);
                    const newKey = 'Yellow_dirt_' + suffix;
                    if (this.textures.exists(newKey)) {
                        obj.setTexture(newKey);
                    }
                }
            });
        }
    }

    _checkCheckpoint() {
        if (!this._checkpoint || !this.player) return;
        const cp = this._checkpoint;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, cp.x, cp.y);
        const inRange = dist <= 100;
        const inDialog = this.dialogSystem && this.dialogSystem.isOpen;
        cp.setHintVisible(inRange && !inDialog);
        // 玩家靠近已激活 checkpoint (5 格 = 160 px) → 每秒 -1 侵蚀度 + +1 HP
        const inHealRange = dist <= 160;
        if (cp.activated && inHealRange) {
            const now = this.time.now;
            if (!this._checkpointHealNextAt) this._checkpointHealNextAt = now + 1000;
            if (now >= this._checkpointHealNextAt) {
                if (this.healthSystem && this.healthSystem.healAmount) this.healthSystem.healAmount(1);
                if (this.diseaseSystem && this.diseaseSystem.reduceCorrosion) this.diseaseSystem.reduceCorrosion(1);
                this._checkpointHealNextAt = now + 1000;
            }
        } else {
            this._checkpointHealNextAt = 0;
        }
    }

    /** 玩家近战时检查是否打中水晶矿 */
    _checkMeleeOnCrystalOres() {
        if (!this._crystalOres || !this.player) return;
        // 前方半圆 RANGE=100 + 后方 BACK=32 (半身+0.5格), Y 自然受半圆约束
        const RANGE_SQ = 100 * 100, BACK = 40;
        const px = this.player.x, py = this.player.y;
        const facingRight = !this.player.flipX;
        this._crystalOres.forEach(ore => {
            if (ore.destroyed) return;
            const dx = ore.x - px, dy = ore.y - py;
            if (dx * dx + dy * dy > RANGE_SQ) return;
            if (facingRight && dx < -BACK) return;
            if (!facingRight && dx > BACK) return;
            ore.takeHit(3.5);
            if (this.meleeSystem) this.meleeSystem._swingHit = true;   // (用户) 有反应 → 实打实音
            if (typeof MeleeSystem !== 'undefined') {
                MeleeSystem.playSlashEffect(this, ore.sprite || ore, px, py);
            }
        });
    }

    _checkPendingRespawns() {
        if (!this._pendingRespawns || this._pendingRespawns.length === 0) return;
        if (!this.player) return;
        const px = this.player.x / 32, py = this.player.y / 32;
        const now = this.time.now;
        for (let i = this._pendingRespawns.length - 1; i >= 0; i--) {
            const r = this._pendingRespawns[i];
            if (now < r.readyAt) continue;  // 时间还没到
            // 时间到了 — 检查玩家是否在 home chunk 内
            if (r.homeChunk) {
                const c = r.homeChunk;
                const playerInChunk = (px >= c.x1 && px <= c.x2 + 1 && py >= c.y1 && py <= c.y2 + 1);
                if (!playerInChunk) continue;  // 玩家不在 → 继续等
            }
            // 重生
            this._pendingRespawns.splice(i, 1);
            const m = new r.cls(this, r.x, r.y);
            const grp = this[r.groupName];
            if (grp) grp.add(m);
            if (m.setDepth) m.setDepth(10);
            if (this.uiCam) { try { this.uiCam.ignore(m); } catch(e) {} }
            if (r.groupName === 'bats' && m.body) {
                m.body.setAllowGravity(false);
                m.body.setVelocity(0, 0);
            }
            m._spawnX = r.x;
            m._spawnY = r.y;
            m._spawnClass = r.cls;
            m._spawnGroupName = r.groupName;
            m._homeChunk = r.homeChunk;
            // 监听销毁 → 再次调度
            m.once('destroy', () => {
                const delay = Phaser.Math.Between(300000, 480000);
                this._pendingRespawns.push({
                    cls: r.cls, groupName: r.groupName, x: r.x, y: r.y,
                    homeChunk: r.homeChunk, readyAt: this.time.now + delay
                });
            });
        }
    }

    _checkPlatformGuide() {
        if (this._platformGuideUnlocked || !this.player) return;
        if (!this.guideSystem || !this.guideSystem.registerGuide) return;
        if (!this.walls || !this.walls.getChildren) return;
        const G = 32;
        const px = this.player.x, py = this.player.y;
        const wallChildren = this.walls.getChildren();
        for (const w of wallChildren) {
            if (!w || !w._isPlatform) continue;
            const dx = w.x - px, dy = w.y - py;
            if (dx * dx + dy * dy <= (5 * G) * (5 * G)) {
                this._platformGuideUnlocked = true;
                this.guideSystem.registerGuide({
                    id: 'platform',
                    title: 'Platform',
                    animType: 'platform',
                    captionText: 'Jump (SPACE) onto a platform from below. Press S while on top to drop down through it.'
                });
                break;
            }
        }
    }

    _updateChunkCamera() {
        if (!this._chunks || !this.player) return;
        if (this._cinematicLock) return;
        const px = this.player.x / 32;
        const py = this.player.y / 32;
        let newChunk = null;
        for (const c of this._chunks) {
            if (px >= c.x1 && px <= c.x2 + 1 &&
                py >= c.y1 && py <= c.y2 + 1) {
                newChunk = c;
                break;
            }
        }
        if (!newChunk) return;

        // Hysteresis: zone2 → zone1 边界往左移 1 格
        // 默认重叠区在 px=[8.5, 9.5], zone1→zone2 在 px>9.5 切换 (右行)
        // 这里强制 zone2→zone1 只在 px<=7.5 才切回 (左行多走 1 格才切镜头)
        if (this._currentChunkId === 'zone2' && newChunk.id === 'zone1' && px > 7.5) {
            return;
        }

        if (newChunk.id !== this._currentChunkId) {
            this._currentChunkId = newChunk.id;
            const cam = this.cameras.main;
            const x1 = newChunk.x1 * 32;
            const y1 = newChunk.y1 * 32;
            const w  = (newChunk.x2 - newChunk.x1 + 1) * 32;
            const h  = (newChunk.y2 - newChunk.y1 + 1) * 32;
            cam.setBounds(x1, y1, w, h);
            cam.centerOn(this.player.x, this.player.y);
        }
    }

    _isInView(x, y, margin = 250) {
        let v = this.cameras.main.worldView;
        return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
    }

    _isClickOnHUDButton(pointer) {
        const sx = pointer.x, sy = pointer.y;
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;
        if (Math.abs(sx - (W - 40)) < 32 && Math.abs(sy - 40) < 32) return true;
        if (Math.abs(sx - (W - 100)) < 32 && Math.abs(sy - 40) < 32) return true;
        if (Math.abs(sx - 40) < 32 && Math.abs(sy - (H - 40)) < 32) return true;
        if (Math.abs(sx - 60) < 32 && Math.abs(sy - 180) < 32) return true;
        return false;
    }

    // ============= Boss Intro Cinematic =============
    _startBossIntro() { /* SZ5: stub — boss 还没做 */ }

    _startBossTakeoff() { /* SZ5: stub */ }

    /** Boss 起飞到顶后，双手围着 boss 逆时针绕一圈（半径 2.5 格 = 80px） */
    _startHandsOrbit() { /* SZ5: stub */ }

    _tryFinishBossIntro() { /* SZ5: stub */ }

    _showBossBanner(onDone) {
        const cam = this.cameras.main;
        const W = cam.width, H = cam.height;

        const container = this.add.container(-W, H / 2).setScrollFactor(0).setDepth(999).setScale(2.5);

        // 深石色底板 (520×220)，金棕描边
        const bg = this.add.rectangle(0, 0, 520, 220, 0x2a2218, 0.95)
            .setStrokeStyle(4, 0xaa8855);

        // boss 头像占位 — 灰色方块 + X 标记 (待 PNG 替换)
        const portraitBg = this.add.rectangle(-150, 0, 140, 140, 0x444444)
            .setStrokeStyle(3, 0x888888);
        const px1 = this.add.rectangle(-150, 0, 100, 4, 0x222222); px1.angle = 45;
        const px2 = this.add.rectangle(-150, 0, 100, 4, 0x222222); px2.angle = -45;

        // 名字大字 (居中)
        const nameText = this.add.text(60, 0, 'STONE GUARDIAN', {
            fontSize: '40px', color: '#ffffff',
            fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5);

        container.add([bg, portraitBg, px1, px2, nameText]);

        this.time.delayedCall(20, () => {
            if (this.cameras.main && container.scene) {
                try { this.cameras.main.ignore(container); } catch(e) {}
            }
        });

        // 元气骑士式: slam in 左 → 停 → slide out 右 (无震屏)
        this.tweens.add({
            targets: container,
            x: W / 2,
            duration: 350,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.time.delayedCall(900, () => {
                    this.tweens.add({
                        targets: container,
                        x: W * 2,
                        duration: 300,
                        ease: 'Back.easeIn',
                        onComplete: () => {
                            container.destroy();
                            if (onDone) onDone();
                        }
                    });
                });
            }
        });
    }

    /** 应用 level data — 用范围 helpers，减少 code */
    _applyLevelData() {
        const G = 32;

        // helpers
        const airRange = (c1, r1, c2, r2) => {
            const cells = new Set();
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) cells.add(c + ',' + r);
            if (this.walls && this.walls.getChildren) {
                this.walls.getChildren().slice().forEach(w => {
                    const wc = Math.floor(w.x / G), wr = Math.floor(w.y / G);
                    if (cells.has(wc + ',' + wr)) w.destroy();
                });
            }
            if (this.wallRects) {
                this.wallRects = this.wallRects.filter(rect => {
                    const wc = Math.floor((rect.x + rect.width / 2) / G);
                    const wr = Math.floor((rect.y + rect.height / 2) / G);
                    return !cells.has(wc + ',' + wr);
                });
            }
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                if (this.gridSystem) this.gridSystem.markRect(c * G + G / 2, r * G + G / 2, G, G, GridSystem.AIR);
            }
        };
        const bgRange = (c1, r1, c2, r2) => {
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                new BackgroundBlock(this, c * G + G / 2, r * G + G / 2, G, G);
            }
        };
        const wallRange = (c1, r1, c2, r2) => {
            const existing = new Set();
            if (this.walls && this.walls.getChildren) {
                this.walls.getChildren().forEach(w => existing.add(Math.floor(w.x / G) + ',' + Math.floor(w.y / G)));
            }
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                if (existing.has(c + ',' + r)) continue;
                new Wall(this, c * G + G / 2, r * G + G / 2, G, G);
            }
        };
        const airBg = (c1, r1, c2, r2) => { airRange(c1, r1, c2, r2); bgRange(c1, r1, c2, r2); };
        const placePlatform = (c, r) => {
            if (typeof PlatformBlock === 'undefined') return;
            // 必须先清掉这格的 wall (防止 wall+platform 叠一起变"透明墙")
            airRange(c, r, c, r);
            const p = new PlatformBlock(this, c * G + G/2, r * G + G/2, G, G);
            if (p.rect && p.rect.body) {
                if (p.rect.body.updateFromGameObject) p.rect.body.updateFromGameObject();
                p.rect.body.checkCollision.down = false;
                p.rect.body.checkCollision.left = false;
                p.rect.body.checkCollision.right = false;
                p.rect.body.checkCollision.up = true;
            }
        };

        // === 1 区房间（左侧主房间）— level_1777648018535 ===
        wallRange(-29, 14, -29, 18);
        wallRange(-28, 13, -28, 14);
        wallRange(-27, 12, -27, 13);
        wallRange(-26, 12, -23, 12);
        wallRange(-23, 13, -22, 13);
        wallRange(-22, 14, -21, 14);
        wallRange(-28, 19, -28, 19);
        airBg(-28, 14, -23, 19);
        airBg(-27, 13, -23, 13);
        airBg(-26, 12, -23, 12);
        airBg(-22, 16, 0, 19);
        airBg(-22, 15, 0, 15);
        airBg(-21, 15, -20, 19);
        airBg(0, 14, 0, 14);

        // === 3 cells 在 (-1~0, 14-15) — level_1777651636433 ===
        airBg(-1, 15, 0, 15);
        airBg(0, 14, 0, 14);

        // === level_1777654256180 — 修补 (只留 spawn 区内的几行) ===
        wallRange(-28, 19, -28, 19);
        airBg(-22, 13, -22, 14);
        airBg(-21, 14, -21, 14);

        // ════════════════════════════════════════════════════════════
        //  SZ5: zone2+ 地形 / boss 房 / 平台 / KeyDoor / chests / hints / NPC 全部删除
        //  只保留 spawn 区地形 (上面 3 个 level_ 注释段). 后续要做 SZ5 内容直接加在这里.
        // ════════════════════════════════════════════════════════════

    }

    /**
     * 删除 spawn (zone1) + boss (zone2) 以外的 wall / bg / skin.
     * 仅清理初始 create() loop 创建的 buffer (level data 源码已经删了).
     */
    _sealNonSpawnBossArea() {
        const G = 32;
        const inSpawnBoss = (cx, cy) => cx >= -30 && cx <= 40 && cy >= 8 && cy <= 25;

        // Walls
        let wallsDestroyed = 0;
        if (this.walls && this.walls.getChildren) {
            this.walls.getChildren().slice().forEach(w => {
                const cx = Math.floor(w.x / G), cy = Math.floor(w.y / G);
                if (!inSpawnBoss(cx, cy)) {
                    try { w.destroy(); } catch(e) {}
                    wallsDestroyed++;
                }
            });
        }

        // wallRects
        if (this.wallRects) {
            this.wallRects = this.wallRects.filter(rect => {
                const cx = Math.floor((rect.x + rect.width / 2) / G);
                const cy = Math.floor((rect.y + rect.height / 2) / G);
                return inSpawnBoss(cx, cy);
            });
        }

        // Cavetile skins + BackgroundBlocks (一次 children loop 搞定)
        let skinsDestroyed = 0, bgDestroyed = 0;
        this.children.list.slice().forEach(c => {
            if (!c) return;
            const cx = Math.floor(c.x / G), cy = Math.floor(c.y / G);
            if (inSpawnBoss(cx, cy)) return;
            // Cavetile skin
            if (c.depth === -5 && c.texture && c.texture.key && c.texture.key.startsWith('Cavetile_')) {
                try { c.destroy(); } catch(e) {}
                skinsDestroyed++;
                return;
            }
            // BackgroundBlock
            if (c._isBackgroundBlock) {
                try { c.destroy(); } catch(e) {}
                bgDestroyed++;
            }
        });

        // gridSystem 标外面为 AIR
        if (this.gridSystem && typeof GridSystem !== 'undefined') {
            for (let c = -39; c <= 139; c++) {
                for (let r = -75; r <= 72; r++) {
                    if (!inSpawnBoss(c, r)) {
                        this.gridSystem.markRect(c * G + G/2, r * G + G/2, G, G, GridSystem.AIR);
                    }
                }
            }
        }

        // console.log(`[SZ5 Seal] walls: -${wallsDestroyed}, skins: -${skinsDestroyed}, bg: -${bgDestroyed}`);   // (用户) 诊断日志静默
    }
}
/**
 * SafeZone3Scene — 1 号安全区
 * 玩家通过 Tutorial SecretDoor 进入这里
 * 场景大小 = 屏幕可视范围（zoom 1.25 下：1280×720）
 * 继承 Tutorial 的物品/背包/水晶等状态
 */
class SafeZone3Scene extends MainGameScene {

    constructor() {
        super();
        Phaser.Scene.call(this, { key: 'SafeZone3Scene' });
    }

    init(data) {
        // 接收上一个场景传来的状态（由 SecretDoor 传入）
        this._inheritedData = data || {};
    }

    // ════════════════════════════════════════════════════════════════
    // 真稿子系统 — 直接定义在 SZ3 内 (不依赖 GameScene.js 是否更新)
    // ════════════════════════════════════════════════════════════════
    /** 装真稿子 — 需在 player/walls/recallSystem 已创建后调用 */

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

    /** 真稿子物理更新 — 跟 GameScene 内联同套逻辑 */
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

    preload() {
        if (typeof super.preload === 'function') super.preload();
        // (用户) 背景图层 — SZ2.5 (继承本 preload) + SZ3 各自三层
        this.load.image('sz2.5_bg_L1', 'assets/images/sz2.5_bg_L1.png');
        this.load.image('sz2.5_bg_L2', 'assets/images/sz2.5_bg_L2.png');
        this.load.image('sz2.5_bg_L3', 'assets/images/sz2.5_bg_L3.png');
        this.load.image('sz3_bg_L1', 'assets/images/sz3_bg_L1.png');
        this.load.image('sz3_bg_L2', 'assets/images/sz3_bg_L2.png');
        this.load.image('sz3_bg_L3', 'assets/images/sz3_bg_L3.png');
    }

    create() {
        // (用户) SZ3 BGM = Upper/Lower 双轨按附近 5 格皮肤占比交叉淡变 (见 _sz3BgmUpdate), 入场停旧 BGM
        if (typeof AudioSystem !== 'undefined') AudioSystem.stopBGM();

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

        // === SZ3 3 层背景 (SZ1/2 同款管线: 原生尺寸不缩放; 仅 L2 左右视差 sf 0.5, Y 1:1) ===
        // depth: L3 最深(-103) → L2(-102) → L1 最前(-101); 锚点暂置地图中心, 待按格微调
        {
            const bgX = W / 2 - 78 * 32, bgY = H / 2 + 58 * 32;   // (用户) 左移 78 格 + 下移 58 格
            if (this.textures.exists('sz3_bg_L3')) this.bgL3 = this.add.image(bgX, bgY, 'sz3_bg_L3').setScrollFactor(1, 1).setDepth(-103);
            if (this.textures.exists('sz3_bg_L2')) this.bgL2 = this.add.image(bgX - 20 * 32, bgY, 'sz3_bg_L2').setScrollFactor(0.5, 1).setDepth(-102);
            if (this.textures.exists('sz3_bg_L1')) this.bgL1 = this.add.image(bgX, bgY, 'sz3_bg_L1').setScrollFactor(1, 1).setDepth(-101);
        }

        // 背景 (旧平面底图 → 下沉 -110 作最深兜底, 不挡视差层)
        if (this.textures.exists('Tutorial_scene_background_image')) {
            this.bg = this.add.image(W / 2, H / 2, 'Tutorial_scene_background_image');
            const bgScale = Math.max(W / this.bg.width, H / this.bg.height);
            this.bg.setScale(bgScale).setScrollFactor(0).setDepth(-110);
        }

        this._initT1State();
        this.input.mouse.disableContextMenu();
        this._registerAnims();

        // 按键
        this.keyJump   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyJumpW  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);   // (用户) W 同跳 — 与 SPACE 共用同一跳跃路径
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

        // GridSystem — 0.5x 缩放后 (从 spawn (-13, 9) 扩: 左 100, 右 15, 上 5, 下 125)
        //   col 范围: -113 ~ 3 (chunk 限制)
        //   row 范围:    4 ~ 134 (chunk 限制)
        const BUF_T = 7, BUF_B = 125, BUF_L = 115, BUF_R = 3;
        const EXT_R = 0, EXT_T = 0;
        // (用户) 世界裁剪: 旧 totalW 把 W(1280px=40格) 当右侧空带全算进去 — 内容 col 实际只到 3 (边界墙 -113..3)
        const totalW = (5 - (-BUF_L) + 1) * G;            // cols -115..5 (右侧裁掉 ~37 列空地)
        const totalH = (138 - (-BUF_T) + 1) * G;          // rows -7..138 (底部裁掉 ~9 行空地)
        const originX = -BUF_L * G;
        const originY = -(BUF_T + EXT_T) * G;
        this.gridSystem = new GridSystem(this, G, totalW, totalH, originX, originY);

        // 物理组
        this.walls = this.physics.add.staticGroup();
        this.platforms = this.physics.add.staticGroup();
        this.bgBlocks = this.physics.add.staticGroup();
        this.crystalBlocks = this.physics.add.staticGroup();
        this.wallRects = [];
        this.droppedCrystals = this.physics.add.group();
        this.droppedYellowCrystals = this.physics.add.group();
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
        // === 可见区域 interior terrain (地板/顶/侧墙/BG) 已全部删除 — 全图空 ===

        // === 可见区域 cavetile border + interior 已全部删除 — 全图空, 只在 _applyLevelData 里加 spawn preserve ===

        // 应用 level data（仅 spawn preserve 小房间）
        this._applyLevelData();

        // 物理边界 — 用新 BUF 尺寸
        this.physics.world.setBounds(
            -BUF_L * G,
            -BUF_T * G,
            totalW,
            totalH
        );   // (用户) 物理边界与裁剪后的网格一致

        // (用户) 删掉重复的 renderSkins — 这里跑一遍、后面"渲染 CavetileWall 皮肤"又跑一遍,
        //        全图几千面墙的皮肤计算白做一次, 是重进存档卡顿的大头之一 (真正的调用在后面)

        // 网格线（按 R 切换）
        this._gridGraphics = this.add.graphics().setDepth(0);
        this._gridGraphics.lineStyle(1, 0xffffff, 0.15);
        for (let x = 0; x <= W; x += G) {
            this._gridGraphics.moveTo(x, 0);
            this._gridGraphics.lineTo(x, H);
        }
        for (let y = 0; y <= H; y += G) {
            this._gridGraphics.moveTo(0, y);
            this._gridGraphics.lineTo(W, y);
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

        // SZ3 Yellow_dirt 皮肤区域: 把 Cavetile_wall_* 换成 Yellow_dirt_* (对应后缀)
        this._sz3ApplyYellowDirtSkin(-88, 19, -23, 60);  // 区域 1
        this._sz3ApplyYellowDirtSkin(-94, 61, -36, 70);  // 区域 2
        this._sz3ApplyYellowDirtSkin(-97, 38, -89, 55);  // 区域 3 — 左侧中部 (之前没覆盖到, 一直是洞穴皮)
        this._sz3ApplyYellowDirtSkin(-94, 70, -89, 70);  // 区域 4 — (-89~-94, 70)

        // === level_1780243507320.json — 皮肤覆盖 ===
        // platform 标记 → 这些格保留 Cavetile_wall (不要 Yellow_dirt)
        // air 标记 → 这些格应用 Yellow_dirt (即使在 Yellow_dirt 主区域外)
        const _skinRevertToCavetile = [
            [-36, 70],
            [-36, 69],
            [-37, 70],
            [-36, 68],
            [-37, 69],
            [-38, 70],
            [-66, 70],
            [-67, 69],
            [-67, 70],
            [-68, 69],
            [-68, 70],
            [-69, 69],
            [-69, 70],
            [-70, 69],
            [-70, 70],
            [-71, 69],
            [-71, 70],
            [-71, 68],
            [-72, 68],
            [-72, 69],
            [-72, 67],
            [-73, 67],
            [-73, 68],
            [-74, 67],
            [-74, 68],
            [-75, 67],
            [-75, 68],
            [-76, 67],
            [-76, 68],
            [-77, 67],
            [-77, 68],
            [-78, 67],
            [-78, 68],
            [-79, 67],
            [-79, 68],
            [-80, 67],
            [-80, 68],
            [-81, 68],
            [-81, 69],
            [-82, 68],
            [-82, 69],
            [-83, 68],
            [-83, 69],
            [-84, 68],
            [-84, 69],
            [-86, 69],
            [-85, 69],
            [-86, 68],
            [-85, 68],
            [-87, 68],
            [-88, 69],
            [-87, 69],
            [-88, 68],
            [-89, 68],
            [-89, 69],
            [-90, 68],
            [-90, 69],
            [-91, 68],
            [-91, 69],
            [-92, 68],
            [-92, 69],
            [-93, 68],
            [-93, 69],
            [-94, 68],
            [-94, 69],
            [-93, 61],
            [-92, 61],
            [-92, 62],
            [-91, 61],
            [-91, 62],
            [-91, 63],
            [-91, 64],
            [-91, 65],
            [-91, 66],
            [-91, 67],
            [-92, 67],
            [-90, 67],
            [-90, 66],
            [-90, 65],
            [-89, 66],
            [-89, 67],
            [-88, 67],
            [-87, 67],
            [-88, 66],
            [-89, 65],
            [-90, 64],
            [-90, 63]
        ];
        const _skinApplyYellowDirt = [
            // level_1780243507320.json (1 个)
            [-35, 61],
            // level_1780243699256.json (16 个 — spawn 区附近)
            [-35, 18], [-34, 18], [-35, 17], [-41, 17],
            [-41, 18], [-42, 18], [-41, 16], [-42, 17],
            [-43, 18], [-44, 18], [-35, 16], [-34, 17],
            [-33, 18], [-32, 18], [-35, 15], [-41, 15],
            // level_1780244172646.json (24 个 — 底部走廊 + 左上角扩展)
            [-56, 71], [-55, 71], [-54, 71], [-53, 71], [-52, 71], [-57, 71],
            [-89, 60], [-90, 60], [-89, 59], [-90, 59], [-91, 59],
            [-90, 58], [-91, 58], [-92, 58],
            [-91, 57], [-92, 57], [-93, 57], [-94, 57],
            [-91, 56], [-92, 56], [-93, 56], [-94, 56], [-95, 56], [-96, 56]
        ];
        this._sz3SwapSkinCells(_skinRevertToCavetile, "Yellow_dirt_", "Cavetile_wall_");
        this._sz3SwapSkinCells(_skinApplyYellowDirt, "Cavetile_wall_", "Yellow_dirt_");
        // (用户) 把这两个范围内的 cavetilewall 全还原成初始皮肤 (Cavetile_wall_*, 去掉 Yellow_dirt)
        const _revertRangesToCaveSkin = [];
        for (let c = -94; c <= -72; c++) for (let r = 69; r <= 70; r++) _revertRangesToCaveSkin.push([c, r]);
        for (let c = -94; c <= -92; c++) for (let r = 61; r <= 67; r++) _revertRangesToCaveSkin.push([c, r]);
        this._sz3SwapSkinCells(_revertRangesToCaveSkin, "Yellow_dirt_", "Cavetile_wall_");
        // (用户) (-84,36) + (-89,31)→(-94,37) 应用 Yellow_dirt 皮肤
        this._sz3ApplyYellowDirtSkin(-94, 31, -89, 37);
        this._sz3SwapSkinCells([[-84, 36]], "Cavetile_wall_", "Yellow_dirt_");
        // 物理子系统
        this.ropePhysics   = new RopePhysics(this);
        this.dashSystem    = new DashSystem(this);
        this.movementSystem= new MovementSystem(this);
        this.throwSystem   = new ThrowSystem(this);
        this.grappleSystem = new GrappleSystem(this);
        this.recallSystem  = new RecallSystem(this);
        this.meleeSystem   = new MeleeSystem(this);

        // 玩家
        // 出生点：world (-38, 16) — 玩家从空中摔下来, 落到 row 30 附近
        const spawnX = -38 * G + G / 2;
        const spawnY = 16 * G + G / 2;
        this.spawnX = spawnX;
        this.spawnY = spawnY;
        this.player = new Player(this, spawnX, spawnY);

        // 物理碰撞 — T1 同款（platform 用 checkCollision.down=false 单向）
        this.physics.add.collider(this.player, this.walls);
        this.physics.add.collider(this.droppedCrystals, this.walls);
        this.physics.add.collider(this.droppedYellowCrystals, this.walls);
        // 怪物 ↔ walls
        this.physics.add.collider(this.spiders, this.walls);
        this.physics.add.collider(this.bats, this.walls);
        this.physics.add.collider(this.slimes, this.walls);
        this.physics.add.collider(this.beetles, this.walls);
        this.physics.add.collider(this.earthworms, this.walls);
        this.physics.add.collider(this.mimicOres, this.walls);
        this.physics.add.collider(this.bungeeSpiders, this.walls);
        this.physics.add.collider(this.volatileCrystals, this.walls);

        // 装真稿子系统 (替换原 stub) — 右键丢/左键 grapple/F 换手 需要它
        // (默认锁住, Amber 任务完成后 _pickaxeUpgraded=true 才解锁操作)
        this._setupRealPickaxes();
        this._registerPickMonsterHits();

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
                // (用户) 防穿模 v2 — 与 GameScene 同源:
                if (this.wallRects) {
                    // ① 落点 X 若伸进同高度侧墙体内 → 先水平挤出 (水晶半宽 10)
                    for (const w of this.wallRects) {
                        if (w.bottom > my - 14 && w.top < my + 14 && targetX > w.left - 10 && targetX < w.right + 10) {
                            targetX = (mx <= (w.left + w.right) / 2) ? w.left - 10 : w.right + 10;
                        }
                    }
                    // ② 垂直 raycast 找地板, 钉地板顶 (半高 10 + 2px 余量)
                    let nearestFloorY = Infinity;
                    for (const w of this.wallRects) {
                        if (targetX >= w.left && targetX <= w.right && w.top >= my - 4) {
                            if (w.top < nearestFloorY) nearestFloorY = w.top;
                        }
                    }
                    if (nearestFloorY === Infinity) {
                        targetX = mx; targetY = my;   // 该 X 列没地板 → 回方块原位
                    } else {
                        targetY = nearestFloorY - 12;
                    }
                    // ③ 最终保险: 仍与任何墙重叠 → 回方块原位 (刚打掉的格子必为空气)
                    for (const w of this.wallRects) {
                        if (targetX > w.left - 10 && targetX < w.right + 10 && targetY > w.top - 10 && targetY < w.bottom + 10) {
                            targetX = mx; targetY = my; break;
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
                        // (用户) 下落时长按重力换算 t=√(2d/g)
                        targets: c, y: targetY,
                        duration: Math.max(175, Math.sqrt(2 * Math.max(1, targetY - peakY) / ((this.physics && this.physics.world && this.physics.world.gravity.y) || 1200)) * 1000),
                        ease: 'Quad.easeIn',
                        onComplete: () => { c.angle = 0; }  // 落地后正立
                    })
                });
            }
        });

        // 黄水晶掉落监听 (YCrystalBlock 摧毁后)
        this.events.on('yellow_crystal_dropped', (mx, my, count) => {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 5 + Math.random() * 10;
                let targetX = mx + Math.cos(angle) * radius;
                let targetY = my + Math.sin(angle) * radius;
                if (this.wallRects) {
                    for (const w of this.wallRects) {
                        if (targetX >= w.left && targetX <= w.right &&
                            targetY >= w.top && targetY <= w.bottom) {
                            targetY = w.top - 1; break;
                        }
                    }
                }
                const useYTex = this.textures.exists('YCrystal');
                const tex = useYTex ? 'YCrystal' : (this.textures.exists('Crystal') ? 'Crystal' : 'drop_crystal_img');
                const c = this.add.image(mx, my, tex);
                if (tex === 'YCrystal' || tex === 'Crystal') c.setDisplaySize(20, 20);
                if (!useYTex) c.setTint(0xffcc33);  // 仅贴图缺失时回退染色
                c.setDepth(8);
                if (this.uiCam) this.uiCam.ignore(c);
                c._isYellowCrystal = true;
                c._pickupReadyAt = this.time.now + 500;
                c.active = true;
                this.droppedYellowCrystals.add(c);
                this.tweens.add({ targets: c, x: targetX, duration: 350, ease: 'Linear' });
                this.tweens.add({ targets: c, angle: 360, duration: 350, ease: 'Linear' });
                const peakY = Math.min(my, targetY) - 30;
                this.tweens.add({
                    targets: c, y: peakY, duration: 175, ease: 'Quad.easeOut',
                    onComplete: () => this.tweens.add({
                        // (用户) 下落时长按重力换算 t=√(2d/g)
                        targets: c, y: targetY,
                        duration: Math.max(175, Math.sqrt(2 * Math.max(1, targetY - peakY) / ((this.physics && this.physics.world && this.physics.world.gravity.y) || 1200)) * 1000),
                        ease: 'Quad.easeIn',
                        onComplete: () => { c.angle = 0; }
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

        // 镜头: 8 个区域 — 玩家移动时自动切换镜头边界 (_updateChunkCamera)
        this._chunks = [
            { id: 'zone1', x1: -87,  y1: 17,  x2: -24, y2: 31, camBounds: { x1: -87, y1: 17, x2: -24, y2: 33 } },   // (用户) 区1顶边镜头边界下移 2 格 (15→17)
            // zone2 + zone3 融合镜头: 检测矩形各自不变, 但共用同一相机边界(union), 跨区不切镜头
            { id: 'zone2', x1: -74,  y1: 32,  x2: -24, y2: 58, camBounds: { x1: -75, y1: 32, x2: -24, y2: 70 } },
            { id: 'zone3', x1: -75,  y1: 58,  x2: -45, y2: 70, camBounds: { x1: -75, y1: 32, x2: -24, y2: 70 } },
            { id: 'zone4', x1: -93,  y1: 32,  x2: -75, y2: 67  },
            { id: 'zone5', x1: -45,  y1: 59,  x2: -8,  y2: 111 },
            { id: 'zone6', x1: -92,  y1: 70,  x2: -45, y2: 116,
              camBounds: { x1: -92, y1: 70, x2: -45, y2: 119 } },   // (用户) 仅镜头下界 +3 格 (chunk 判定/怪物围墙不动)
            { id: 'zone7', x1: -110, y1: 57,  x2: -92, y2: 116 },
            { id: 'zone8', x1: -45,  y1: 108, x2: -26, y2: 119 }
        ];
        this._currentChunkId = null;

        // === Mob 透明墙 — 沿全图边界 (只做镜头分区, 不按区困住怪物) ===
        const barrierTh = 4;
        {
            const cx1 = -113 * G, cx2 = (3 + 1) * G;
            const cy1 = 4 * G, cy2 = (134 + 1) * G;
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
        this.cameras.main.setZoom(2);  // 常驻 zoom 参考 SZ2 (=2); 只剧情临时改, 平时不变
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

        // === 玩家空气墙 (隐形屏障, 仿 SZ2 boss 房) — (-45,13)→(-31,14): cols -45..-31, rows 13..14 ===
        {
            const aw = this.add.rectangle(-37.5 * G, 14 * G, 15 * G, 2 * G, 0x000000, 0);
            this.physics.add.existing(aw, true);
            this.physics.add.collider(this.player, aw);
            if (this.uiCam) { try { this.uiCam.ignore(aw); } catch(e) {} }
            this._sz3AirWall = aw;
        }

        // 继承 Tutorial 状态
        this._applyInheritedState();
        if (typeof SaveSystem !== 'undefined') SaveSystem.autoSave(this);   // 进入区域自动存档

        // === 开局实体: Checkpoint + 2 CNPCs + Cryst (隐藏) ===
        // Checkpoint 神像 at (-59, 30) — 6 cells wide × 5 cells tall, 中心向上偏 16px
        this._checkpoint = new Checkpoint(this, -59 * G + G / 2, 30 * G + G / 2 - 16);
        if (this.uiCam) {
            try { this.uiCam.ignore(this._checkpoint.sprite); } catch(e) {}
            try { this.uiCam.ignore(this._checkpoint.eIcon); } catch(e) {}
        }

        // 妹妹 Mira (cnpc2) at (-44, 30), 姐姐 Mica (cnpc3) at (-42, 30)
        // 注意: row 30 是 cell 行, gravity 把他们拉到底部地面
        this._sz3CNpc2 = new CrystalNpc(this, -44, 30, { onInteract: () => {}, npcType: 'twin' });  // Mira 妹
        this._sz3CNpc3 = new CrystalNpc(this, -42, 30, { onInteract: () => {}, npcType: 'twin' });  // Mica 姐
        // CNPC 朝右面对玩家 (玩家落地在右侧)
        this._sz3CNpc2.sprite.flipX = true;
        this._sz3CNpc3.sprite.flipX = true;
        // CNPC collider with walls (gravity 拉他们到地面)
        if (this._sz3CNpc2.sprite) this.physics.add.collider(this._sz3CNpc2.sprite, this.walls);
        if (this._sz3CNpc3.sprite) this.physics.add.collider(this._sz3CNpc3.sprite, this.walls);
        // 隐藏 E icon (剧情中不可交互)
        this._sz3CNpc2._hideHint(); this._sz3CNpc3._hideHint();
        this._sz3CNpc2._cinematicMode = true;
        this._sz3CNpc3._cinematicMode = true;
        // 姐妹对话状态 (共享, 当作一体): 'first' | 'normal' | 'scared'
        this._sisterDialogState = 'first';
        this._sistersIntroRun = false;  // 是否完成开局跑路
        this._sisterPatrolTimer = 0;    // 巡逻计时
        this._sisterPatrolAt = 'statue'; // 当前位置组: 'statue' (-62/-64) | 'middle' (-46/-48) | 'right' (-37/-39)
        this._sisterMoving = false;
        this._sisterTeaseRunning = false;  // tease 跑路中标记 (期间无 E)
        this._sisterTweens = [];
        this._sisterTweensPaused = false;
        this._sisterResumeAt = 0;

        // Cryst NPC at (-46, 30), 初始隐藏, 剧情时显现
        this._sz3Cryst = new CrystalNpc(this, -46, 30, { onInteract: () => {}, npcType: 'chief' });
        if (this._sz3Cryst.sprite) {
            this.physics.add.collider(this._sz3Cryst.sprite, this.walls);
            this._sz3Cryst.sprite.setVisible(false);
            // 暂停物理
            if (this._sz3Cryst.sprite.body) this._sz3Cryst.sprite.body.enable = false;
        }
        this._sz3Cryst._hideHint();
        this._sz3Cryst._cinematicMode = true;
        this._sz3Cryst.eIcon.setVisible(false);

        // Amber CNPC at (-68, 47) — 黄水晶任务 NPC
        this._sz3Amber = new CrystalNpc(this, -68, 47, {
            onInteract: () => this._sz3AmberInteract(),
            npcType: 'smith',
            tint: 0xffcc33  // 黄色, 跟黄水晶配色
        });
        if (this._sz3Amber.sprite) {
            this.physics.add.collider(this._sz3Amber.sprite, this.walls);
        }

        // Citrine CNPC at (-31, 54) — 骗子任务 NPC
        this._sz3Citrine = new CrystalNpc(this, -31, 54, {
            onInteract: () => this._sz3CitrineInteract(),
            npcType: 'scammer',
            tint: 0xddaa44  // 深黄色, 跟 Amber 区分
        });
        if (this._sz3Citrine.sprite) {
            this.physics.add.collider(this._sz3Citrine.sprite, this.walls);
        }
        // Citrine 任务阶段: 'fresh' → 'collect5' → 'collect10' → 'collect20' → 'cutscene' → 'fled' → 'apologized' → 'done'
        this._citrinePhase = 'fresh';

        // ── 4 个普通对话 CNPC (level_1780303147329 批次) ──
        // Toy CNPC at (-76, 28) — 丢玩具任务
        this._sz3ToyNpc = new CrystalNpc(this, -76, 28, {
            onInteract: () => this._sz3ToyNpcInteract(),
            npcType: 'crying_guy',
            idleOverride: this._sz3ToyGiven ? 'Crying_guy_happy' : null,   // 已交玩具则直接 happy
            tint: 0x88ccff
        });
        if (this._sz3ToyNpc.sprite) this.physics.add.collider(this._sz3ToyNpc.sprite, this.walls);

        // Crystal-watcher CNPC at (-49, 42) — 永远面向右, 盯着 (-47,41) 的黄水晶
        this._sz3WatchNpc = new CrystalNpc(this, -49, 42, {
            onInteract: () => this._sz3WatchNpcInteract(),
            npcType: 'teen',
            tint: 0xffdd66
        });
        if (this._sz3WatchNpc.sprite) {
            this._sz3WatchNpc.sprite.flipX = false;  // 面向右
            this.physics.add.collider(this._sz3WatchNpc.sprite, this.walls);
        }

        // Solitude CNPC at (-82, 53) — 永远面向右, 想独处
        this._sz3SoloNpc = new CrystalNpc(this, -82, 53, {
            onInteract: () => this._sz3SoloNpcInteract(),
            npcType: 'autistic_guy',   // (用户) AutisticGuy_Sit 坐姿皮肤 (384×64 / 6 帧)
            tint: 0xaabbcc
        });
        if (this._sz3SoloNpc.sprite) {
            this._sz3SoloNpc.sprite.flipX = false;  // 面向右
            this.physics.add.collider(this._sz3SoloNpc.sprite, this.walls);
        }

        // Encourager CNPC at (-41, 66) — 鼓励冒险者
        this._sz3EncourageNpc = new CrystalNpc(this, -41, 66, {
            onInteract: () => this._sz3EncourageNpcInteract(),
            npcType: 'gatekeeper',   // (推断) 紧挨 KeyDoor 1 的守门人 — 若应是别的 NPC, 改这里的 npcType
            tint: 0xff99cc
        });
        if (this._sz3EncourageNpc.sprite) this.physics.add.collider(this._sz3EncourageNpc.sprite, this.walls);

        // === 开局剧情启动 ===
        this._cinematicLock = true;
        this._sz3IntroPhase = 0;
        this._sz3IntroStarted = false;
        this.cameras.main.fadeIn(800);
        // 玩家面向左 (flipX = true)
        this.player.flipX = true;
        // 玩家暂时不能移动 — 由 _cinematicLock 锁定
        // 启动剧情 (100ms 延迟避免 fadeIn 干扰)
        this.time.delayedCall(100, () => this._sz3StartIntro());
    }

    // ============================================================
    // === SZ3 开局剧情系统 ===
    // ============================================================
    //
    // 阶段:
    //   0 FALL — 玩家自由下落 (0.4x gravity, zoom 4, vignette)
    //   1 LANDED — 落地, 显示 stand_up 第一帧 (趴下)
    //   2 CNPC2_LINES — 妹妹 2 句对话
    //   3 CNPC3_LINES — 姐姐 2 句对话
    //   4 STAND_UP — 玩家播 stand_up 动画
    //   5 SCREAM — 两人同时尖叫 "诈尸了" "快跑"
    //   6 KIDS_RUN — 两个 CNPC 跑到神像左侧
    //   7 CRYST_WALK — Cryst 从 -51 走到 -42, 边走边说
    //   8 CRYST_CHOICE — 最后一句 "需要治疗吗" + 选项
    //   9 DONE — 解锁玩家
    _sz3StartIntro() {
        const s = this;
        const cam = s.cameras.main;
        s._sz3IntroStarted = true;
        s._sz3IntroPhase = 0;

        // HUD 隐藏 (剧情中)
        if (s.hudSystem && s.hudSystem.setHUDVisible) s.hudSystem.setHUDVisible(false);

        // 玩家: 速度归零, 重力 0.4x (慢慢落)
        if (s.player && s.player.body) {
            s.player.body.setVelocity(0, 0);
            s._sz3OrigGravity = s.physics.world.gravity.y;
            s.physics.world.gravity.y = s._sz3OrigGravity * 0.4;
        }

        // 镜头: zoom 4, 跟随玩家
        s._sz3OrigBounds = {
            x: cam._bounds.x, y: cam._bounds.y,
            width: cam._bounds.width, height: cam._bounds.height
        };
        cam.removeBounds();
        cam.stopFollow();
        cam.zoomTo(4, 1500, 'Power2', true);
        cam.startFollow(s.player, true, 0.15, 0.15);

        // vignette
        s._sz3CreateVignette();
    }

    _sz3CreateVignette() {
        const s = this;
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;
        const gfx = s.add.graphics();
        gfx.setScrollFactor(0).setDepth(820);
        const LAYERS = 24;
        const maxInset = W * 0.30;
        for (let i = 0; i < LAYERS; i++) {
            const t = i / (LAYERS - 1);
            const a = (1 - t) * (1 - t) * 0.12;
            const inset = t * maxInset;
            const band = W * 0.025;
            gfx.fillStyle(0x000000, a);
            gfx.fillRect(0, inset, W, band);
            gfx.fillRect(0, H - inset - band, W, band);
            gfx.fillRect(inset, 0, band, H);
            gfx.fillRect(W - inset - band, 0, band, H);
        }
        gfx.alpha = 0;
        s._sz3Vignette = gfx;
        try { s.cameras.main.ignore(gfx); } catch(e) {}
        s.tweens.add({ targets: gfx, alpha: 1, duration: 1500, ease: 'Power2' });
    }

    _sz3FadeOutVignette() {
        const s = this;
        if (!s._sz3Vignette) return;
        s.tweens.add({
            targets: s._sz3Vignette, alpha: 0, duration: 800, ease: 'Power2',
            onComplete: () => { if (s._sz3Vignette) { s._sz3Vignette.destroy(); s._sz3Vignette = null; } }
        });
    }

    _sz3IntroUpdate(time, delta) {
        if (!this._sz3IntroStarted) return;
        const s = this;
        if (!s.player || !s.player.body) return;

        // 玩家 X 速度归零 (锁定不准走)
        s.player.body.setVelocityX(0);
        s.player.flipX = true;  // 全程面向左

        // === PHASE 0: 自由下落 ===
        if (s._sz3IntroPhase === 0) {
            // 落地检测: blocked.down 或者 body.bottom 触地
            if (s.player.body.blocked.down || s.player.body.touching.down) {
                s._sz3IntroPhase = 1;
                s._sz3LandedTime = time;
                // 恢复重力
                if (s._sz3OrigGravity != null) s.physics.world.gravity.y = s._sz3OrigGravity;
                s.player.body.setVelocity(0, 0);
                // 落地立即播 stand_up_p1 (frame 0→13), 停在 13
                if (s.anims.exists('stand_up_p1')) {
                    try {
                        s.player.setOrigin(0.5, 0.578);  // 跟 Tutorial 一样 origin 偏移
                        s.player.play('stand_up_p1');
                        // p1 播完自动停在 frame 13 (repeat:0)
                    } catch(e) {
                        if (s.textures.exists('Miner_stand_up')) s.player.setTexture('Miner_stand_up', 13);
                    }
                } else if (s.textures.exists('Miner_stand_up')) {
                    s.player.setOrigin(0.5, 0.578);
                    s.player.setTexture('Miner_stand_up', 13);
                }
            }
            return;
        }

        // === PHASE 1: 趴 + 起身到一半 (frame 13), 等 1.2 秒后对话 ===
        if (s._sz3IntroPhase === 1) {
            if (time - s._sz3LandedTime > 1200) {
                s._sz3IntroPhase = 2;
                s._sz3FadeOutVignette();
                // 妹妹 2 句对话
                s.dialogSystem.showSequence([
                    { speaker: '???', text: 'Sis, something fell from the sky again!' },
                    { speaker: '???', text: "A shooting star? If we wish on it, will our wish come true?!" }
                ], () => {
                    // 妹妹完, 进姐姐
                    s._sz3IntroPhase = 3;
                    s.dialogSystem.showSequence([
                        { speaker: '???', text: "I don't think so. Look — it's got arms and legs." },
                        { speaker: '???', text: "It's just a wild monkey!" }
                    ], () => {
                        // 姐姐说完"猴子", 主角动画从 frame 13 继续播到结束
                        s._sz3IntroPhase = 4;
                        s._sz3PlayStandUp();
                    });
                });
            }
            return;
        }

        // PHASE 2/3/4/5/6/7/8 都由对话/tween 推进, update 不做事
    }

    _sz3PlayStandUp() {
        const s = this;
        // 从 frame 13 继续播到结束 (stand_up_p2: 13→29)
        if (s.anims.exists('stand_up_p2')) {
            try {
                s.player.play('stand_up_p2');
                s.player.once('animationcomplete-stand_up_p2', () => {
                    // origin 平滑回 0.5
                    s.tweens.add({
                        targets: s.player, originY: 0.5, duration: 300, ease: 'Cubic.easeOut',
                        onComplete: () => {
                            if (s.anims.exists('idle')) {
                                try { s.player.play('idle'); } catch(e) {}
                            }
                            s.player.flipX = true;  // 还是面向左
                            // 进 phase 5: 同时尖叫
                            s._sz3IntroPhase = 5;
                            s._sz3PlayScream();
                        }
                    });
                });
            } catch(e) {
                s._sz3IntroPhase = 5;
                s._sz3PlayScream();
            }
        } else {
            s._sz3IntroPhase = 5;
            s._sz3PlayScream();
        }
    }

    _sz3PlayScream() {
        const s = this;
        // 两人同时尖叫
        s.dialogSystem.showSequence([
            { speaker: '???', text: 'AAAH!!! IT MOVED!!! THE DEAD THING MOVED!!!' },
            { speaker: '???', text: 'RUN!!!' }
        ], () => {
            // 跑路 — 神像 col=-59, 妹妹跑到 col=-64, 姐姐 col=-62
            s._sz3IntroPhase = 6;
            s._sz3KidsRun();
        });
    }

    _sz3KidsRun() {
        const s = this;
        const G = 32;
        // 妹妹 cnpc2 → col -64, 姐姐 cnpc3 → col -62
        const targets = [
            { npc: s._sz3CNpc2, targetCol: -64 },
            { npc: s._sz3CNpc3, targetCol: -62 }
        ];
        let doneCount = 0;
        targets.forEach(({ npc, targetCol }) => {
            if (!npc || !npc.sprite) { doneCount++; return; }
            const targetX = targetCol * G + G / 2;
            // 跑左方向, flipX = false (sprite 默认朝右, 翻转 = 朝左)
            npc.sprite.flipX = false;
            if (npc._playAnim && npc._animProfile && npc._animProfile.walk) npc._playAnim(npc._animProfile.walk);   // (用户) 跑动播 walk 动画
            s.tweens.add({
                targets: npc.sprite,
                x: targetX,
                duration: 1500,
                ease: 'Linear',
                onUpdate: () => { npc.x = npc.sprite.x; },
                onComplete: () => {
                    npc.x = npc.sprite.x;
                    if (npc._playAnim && npc._animProfile) npc._playAnim(npc._animProfile.idle);   // (用户) 到位还原 idle
                    npc.sprite.flipX = true;  // 跑完转身回头看
                    doneCount++;
                    if (doneCount === 2) {
                        // 两人到位 (神像左侧), 标记巡逻状态
                        s._sisterPatrolAt = 'statue';
                        s._sistersIntroRun = true;
                        // Cryst 出现
                        s._sz3IntroPhase = 7;
                        s._sz3CrystAppear();
                    }
                }
            });
        });
    }

    _sz3CrystAppear() {
        const s = this;
        const G = 32;
        if (!s._sz3Cryst || !s._sz3Cryst.sprite) {
            s._sz3IntroPhase = 9;
            s._sz3IntroFinish();
            return;
        }
        // 显现 Cryst at (-51, 30)
        s._sz3Cryst.sprite.setVisible(true);
        if (s._sz3Cryst.sprite.body) s._sz3Cryst.sprite.body.enable = true;
        s._sz3Cryst.sprite.flipX = true;  // 朝右 (走向 +x = 朝右 = flipX=true 看玩家定义)
        // 走到姐姐原本位置 (-42, 30)
        const targetX = -42 * G + G / 2;
        // 开始走 + 边走边说 5 句, 最后 1 句带选项
        s.tweens.add({
            targets: s._sz3Cryst.sprite,
            x: targetX,
            duration: 2000,
            ease: 'Linear',
            onUpdate: () => { s._sz3Cryst.x = s._sz3Cryst.sprite.x; },
            onComplete: () => {
                s._sz3Cryst.x = s._sz3Cryst.sprite.x;
                s._sz3Cryst.sprite.flipX = true;  // 站定朝右
            }
        });
        // 同时启动对话 (5 句叙述 + 1 句选择, 跑期间播)
        s.time.delayedCall(300, () => {
            s.dialogSystem.showSequence([
                { speaker: '???', text: 'Easy, little ones. This is a human.' },
                { speaker: '???', text: "It's been a long time since a human ever stepped foot here." },
                { speaker: '???', text: 'Welcome, unexpected guest.' },
                { speaker: 'Cryst', text: 'My name is Cryst. This is the Crystal Ville.' },
                { speaker: 'Cryst', text: "I don't know how you got here — but you're hurt, and you'll need help." }
            ], () => {
                s._sz3IntroPhase = 8;
                s.dialogSystem.show({
                    speaker: 'Cryst',
                    text: 'Will you let me tend to your wounds?',
                    choices: [
                        { label: 'Yes', action: () => s._sz3CrystHealPath() },
                        { label: 'May I ask you a few things first?', action: () => s._sz3CrystQuestionPath() }
                    ]
                });
            });
        });
    }

    // === YES 路径: Cryst 走到 (-57,30), 带玩家到 (-56,30) ===
    _sz3CrystHealPath() {
        const s = this;
        s.dialogSystem.close();
        s._sz3LeadToGuardian([
            { speaker: 'Cryst', text: "I can tell you mean no harm. Our kind must have seem strange to you." },
            { speaker: 'Cryst', text: 'But first — let me bring you to our Guardian Crystal. It is what keeps us alive.' },
            { speaker: 'Cryst', text: 'Does the pain ease, even a little?' },
            { speaker: 'You', text: "Yes... a little. I do have questions, though. Would you answer them?" }
        ]);
    }

    // === 问问题路径: 先回 2 句, 再同样带去 Guardian ===
    _sz3CrystQuestionPath() {
        const s = this;
        s.dialogSystem.close();
        s.dialogSystem.showSequence([
            { speaker: 'Cryst', text: 'Of course, human.' },
            { speaker: 'Cryst', text: 'But as our guest, let me bring you to the Guardian Crystal first.' }
        ], () => {
            s._sz3LeadToGuardian([
                { speaker: 'Cryst', text: "I can tell you mean no harm. Our kind must seem strange to you." },
                { speaker: 'Cryst', text: 'This is our Guardian Crystal — what keeps us alive.' },
                { speaker: 'Cryst', text: 'Does the pain ease, even a little?' },
                { speaker: 'You', text: "Yes... a little. And yes — I have questions. Would you answer them?" }
            ]);
        });
    }

    // 共用: Cryst 走到 (-57,30) + 玩家走到 (-56,30), 播 leadLines, 完了进 Q&A
    _sz3LeadToGuardian(leadLines) {
        const s = this;
        const G = 32;
        const crystTarget = -57 * G + G / 2;
        const playerTarget = -56 * G + G / 2;
        // Cryst 朝左走 (-42 → -57)
        if (s._sz3Cryst && s._sz3Cryst.sprite) {
            s.tweens.killTweensOf(s._sz3Cryst.sprite);   // (用户) 先杀接近 tween — 快速跳过对话时它还没跑完, 会与本押送拉锯 + 其 onComplete 把朝向翻回右 → 倒着走
            s._sz3Cryst._lastCrystX = s._sz3Cryst.sprite.x;
            s._sz3Cryst.sprite.flipX = false;  // 朝左
            if (s._sz3Cryst._playAnim && s._sz3Cryst._animProfile && s._sz3Cryst._animProfile.walk) s._sz3Cryst._playAnim(s._sz3Cryst._animProfile.walk);   // (用户) 走位播 walk 动画
            s.tweens.add({
                targets: s._sz3Cryst.sprite, x: crystTarget, duration: 2600, ease: 'Linear',
                onUpdate: () => {
                    // (用户) 朝向每帧按实际位移方向定 (右移 flipX=true, 左移 false) — 任何残余翻向都摁回
                    const _px = s._sz3Cryst._lastCrystX;
                    s._sz3Cryst._lastCrystX = s._sz3Cryst.sprite.x;
                    if (_px !== undefined) {
                        const _dx = s._sz3Cryst.sprite.x - _px;
                        if (Math.abs(_dx) > 0.1) s._sz3Cryst.sprite.flipX = _dx > 0;
                    }
                    s._sz3Cryst.x = s._sz3Cryst.sprite.x;
                },
                onComplete: () => {
                    s._sz3Cryst.x = s._sz3Cryst.sprite.x;
                    if (s._sz3Cryst._playAnim && s._sz3Cryst._animProfile) s._sz3Cryst._playAnim(s._sz3Cryst._animProfile.idle);   // (用户) 还原 idle
                    s._sz3Cryst.sprite.flipX = true;
                }
            });
        }
        // 玩家也朝左走到 (-56,30)
        s.player.flipX = true;
        if (s.anims.exists('run')) { try { s.player.play('run', true); } catch(e) {} }
        s._forceStepKey = 'GrassRun';   // (用户) 剧情走位脚步: 借用玩家走路循环轨 (SZ3 黄土面 → GrassRun)
        s.tweens.add({
            targets: s.player, x: playerTarget, duration: 2600, ease: 'Linear',
            onUpdate: () => {
                if (s.player.body) s.player.body.reset(s.player.x, s.player.y);
                // (用户) 走路动画每帧重申 — 押送期间有未知路径会把 run 摁掉 (蝙蝠破图同款防御)
                const _pa = s.player.anims;
                if (s.anims.exists('run') && (!_pa.currentAnim || _pa.currentAnim.key !== 'run' || !_pa.isPlaying)) {
                    try { s.player.play('run', true); } catch (e) {}
                }
            },
            onComplete: () => {
                s._forceStepKey = null;   // (用户) 走位结束收脚步
                if (s.player.body) s.player.body.setVelocity(0, 0);
                if (s.anims.exists('idle')) { try { s.player.play('idle'); } catch(e) {} }
                s.player.flipX = true;
            }
        });
        // 走的一瞬间就开始说 leadLines, 完了进 Q&A
        s.dialogSystem.showSequence(leadLines, () => {
            s.dialogSystem.showSequence([
                { speaker: 'Cryst', text: "Of course, my friend. Ask, and I'll hold nothing back." }
            ], () => s._sz3ShowQuestionMenu());
        });
    }

    // === 4 选项问答菜单 (Q1-3 答完循环回来, Q4 退出) ===
    _sz3ShowQuestionMenu() {
        const s = this;
        s.dialogSystem.show({
            speaker: 'Cryst',
            text: 'What would you like to know?',
            choices: [
                { label: "Shouldn't crystals be blue? Why are these yellow?", action: () => s._sz3Q1() },
                { label: 'How do you know I mean no harm?', action: () => s._sz3Q2() },
                { label: 'What are these statues? Why do they feel soothing?', action: () => s._sz3Q3() },
                { label: 'I have no more questions.', action: () => s._sz3QDone() }
            ]
        });
    }

    _sz3Q1() {
        const s = this;
        s.dialogSystem.close();
        s.dialogSystem.showSequence([
            { speaker: 'Cryst', text: 'They should be yellow. The blue ones are corrupted, don\'t stay long exposure of it.' },
            { speaker: 'Cryst', text: 'It spreads through living things, sinking into their flesh, hollowing them out until only a walking husk remains.' },
            { speaker: 'Cryst', text: 'Once infected, there is but one cure: slay the mother that birthed it. A dreadful thing.' },
            { speaker: 'You', text: 'Where can I find it?' },
            { speaker: 'Cryst', text: "I cannot say for certain. But walk deep enough into the mines, and you may encounter it." }
        ], () => s._sz3ShowQuestionMenu());
    }

    _sz3Q2() {
        const s = this;
        s.dialogSystem.close();
        s.dialogSystem.showSequence([
            { speaker: 'Cryst', text: "Simple. You carry no raw meat." },
            { speaker: 'You', text: 'What does raw meat have to do with it?' },
            { speaker: 'Cryst', text: 'The corruption was no accident — it was farmed. Long ago, humans broke in and took our home.' },
            { speaker: 'Cryst', text: 'They brought raw meat by the load, fed it to the beast in the depths, and harvested the blue crystals it made.' },
            { speaker: 'Cryst', text: "For reasons I never learned... they stopped coming, a long time ago." }
        ], () => s._sz3ShowQuestionMenu());
    }

    _sz3Q3() {
        const s = this;
        s.dialogSystem.close();
        s.dialogSystem.showSequence([
            { speaker: 'Cryst', text: "These? So you've passed more than one." },
            { speaker: 'Cryst', text: 'They are wards, raised by our ancestors. Their field holds the corruption at bay — and soothes the wounded, mending them slowly.' },
            { speaker: 'Cryst', text: 'They say only the kind-hearted can wake their protection.' }
        ], () => s._sz3ShowQuestionMenu());
    }

    _sz3QDone() {
        const s = this;
        s.dialogSystem.close();
        s.dialogSystem.showSequence([
            { speaker: 'Cryst', text: 'Then rest easy here, traveler. You are our guest — wander as you please.' },
            { speaker: 'Cryst', text: 'And if you go deeper still... beware the creatures that wait below.' }
        ], () => {
            s._sz3CrystTalkedOnce = true;
            s._sz3IntroFinish();
            // 退出剧情后, 商人从地底钻出
            s.time.delayedCall(400, () => s._sz3SpawnMerchantRise());
        });
    }

    // === 退出剧情后, 再次靠近 Cryst 交互: 重复问答 ===
    _sz3CrystInteract() {
        const s = this;
        if (s.dialogSystem && s.dialogSystem.isOpen) return;
        s.dialogSystem.show({
            speaker: 'Cryst',
            text: 'Is there anything you wish to ask?',
            choices: [
                { label: "Shouldn't crystals be blue? Why are these yellow?", action: () => s._sz3Q1() },
                { label: 'How do you know I mean no harm?', action: () => s._sz3Q2() },
                { label: 'What are these statues? Why do they feel soothing?', action: () => s._sz3Q3() },
                { label: 'Nothing for now.', action: () => s.dialogSystem.close() }
            ]
        });
    }

    // === Yellow_dirt 皮肤应用: 把指定矩形区域内的 Cavetile_wall_* 换成 Yellow_dirt_* ===
    _sz3ApplyYellowDirtSkin(c1, r1, c2, r2) {
        const G = 32;
        const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
        const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
        const minX = minC * G, maxX = (maxC + 1) * G;
        const minY = minR * G, maxY = (maxR + 1) * G;
        let count = 0;
        this.children.list.forEach(obj => {
            if (!obj || !obj.texture || !obj.texture.key) return;
            const key = obj.texture.key;
            if (!key.startsWith('Cavetile_wall_')) return;
            if (obj.x < minX || obj.x >= maxX || obj.y < minY || obj.y >= maxY) return;
            const suffix = key.substring('Cavetile_wall_'.length);
            const newKey = 'Yellow_dirt_' + suffix;
            if (this.textures.exists(newKey)) {
                obj.setTexture(newKey);
                count++;
            }
        });
        // console.log(`[SZ3] Yellow_dirt skin applied: (${c1},${r1}) → (${c2},${r2}), swapped ${count} cavetiles`);   // (用户) 诊断日志静默
    }

    /**
     * 皮肤覆盖 — 按 cell 列表把 fromPrefix → toPrefix 贴图替换
     * 例: _sz3SwapSkinCells([[-72, 67]], "Yellow_dirt_", "Cavetile_wall_") = 把这个格还原成原洞穴墙皮
     */
    _sz3SwapSkinCells(cells, fromPrefix, toPrefix) {
        const G = 32;
        // 用 cell 中心 (col*G+G/2, row*G+G/2) 作匹配 key, 整数精确比较
        const targetSet = new Set(cells.map(([c, r]) => `${c * G + G / 2},${r * G + G / 2}`));
        let count = 0;
        this.children.list.forEach(obj => {
            if (!obj || !obj.texture || !obj.texture.key) return;
            const key = obj.texture.key;
            if (!key.startsWith(fromPrefix)) return;
            const cellKey = `${obj.x},${obj.y}`;
            if (!targetSet.has(cellKey)) return;
            const suffix = key.substring(fromPrefix.length);
            const newKey = toPrefix + suffix;
            if (this.textures.exists(newKey)) {
                obj.setTexture(newKey);
                count++;
            }
        });
        // console.log(`[SZ3] Skin override: ${fromPrefix} → ${toPrefix}, ${count}/${cells.length} cells swapped`);   // (用户) 诊断日志静默
    }

    // === Amber 黄水晶任务 NPC ===
    // ============================================================
    // === 4 个普通对话 CNPC (level_1780303147329) ===
    // ============================================================

    // Toy CNPC (-76,28): 丢玩具. 玩家有玩具 (_sz3HasToy) → 给 → 5 黄水晶
    _sz3ToyNpcInteract() {
        const s = this;
        if (s.dialogSystem && s.dialogSystem.isOpen) return;
        if (s._sz3ToyGiven) {
            s.dialogSystem.showSequence([
                { speaker: 'Child', text: "Thank you! You're so kind!" }
            ], () => s.dialogSystem.close());
            return;
        }
        if (s._sz3HasToy) {
            // 有玩具 — 还是先说那句, 但多 2 个选项
            s.dialogSystem.show({
                speaker: 'Child', text: "I lost my toy. Just... leave me alone for a while.",
                choices: [
                    { label: 'Give the toy you found', action: () => {
                        s.dialogSystem.close();
                        s._sz3ToyGiven = true;
                        if (typeof AchievementSystem !== 'undefined') AchievementSystem.unlock(s, 'sz3_toy');   // (用户成就) 善意在"人"间
                        s._sz3HasToy = false;
                        if (s._sz3ToyNpc) s._sz3ToyNpc._idleOverride = 'Crying_guy_happy';   // cry → happy
                        if (s.hudSystem && s.hudSystem.addYellowCrystal) s.hudSystem.addYellowCrystal(5);
                        s.dialogSystem.showSequence([
                            { speaker: 'Child', text: "Wow! My lost toy! Thank you so much! Here, take 5 yellow crystals as thanks!" }
                        ], () => s.dialogSystem.close());
                    }},
                    { label: 'Leave', action: () => s.dialogSystem.close() }
                ]
            });
            return;
        }
        // 没玩具 — 每次都这句
        s.dialogSystem.showSequence([
            { speaker: 'Child', text: "I lost my toy. Just... leave me alone for a while." }
        ], () => s.dialogSystem.close());
    }

    // Crystal-watcher CNPC (-49,42): 盯着 (-47,41) 的黄水晶, 破坏后换台词
    _sz3WatchNpcInteract() {
        const s = this;
        if (s.dialogSystem && s.dialogSystem.isOpen) return;
        if (s._sz3WatchNpc && s._sz3WatchNpc.sprite) s._sz3WatchNpc.sprite.flipX = false;  // 保持面向右
        // 检查 (-47,41) 的黄水晶是否被破坏
        const G = 32;
        const tx = -47 * G + G / 2, ty = 41 * G + G / 2;
        let destroyed = false;
        if (s._yCrystalOres) {
            const ore = s._yCrystalOres.find(o => Math.abs(o.x - tx) < 4 && Math.abs(o.y - ty) < 4);
            if (ore && ore.destroyed) destroyed = true;
        }
        if (destroyed) {
            s.dialogSystem.showSequence([
                { speaker: '???', text: "Seems crystals only fall when someone breaks them..." }
            ], () => s.dialogSystem.close());
        } else {
            s.dialogSystem.showSequence([
                { speaker: '???', text: "See that yellow crystal up there? I keep wondering when it'll fall." }
            ], () => s.dialogSystem.close());
        }
    }

    // Solitude CNPC (-82,53): 1+2 次说独处, 3+ 说走开
    _sz3SoloNpcInteract() {
        const s = this;
        if (s.dialogSystem && s.dialogSystem.isOpen) return;
        if (s._sz3SoloNpc && s._sz3SoloNpc.sprite) s._sz3SoloNpc.sprite.flipX = false;  // 保持面向右
        s._sz3SoloCount = (s._sz3SoloCount || 0) + 1;
        const line = (s._sz3SoloCount <= 2)
            ? "I like being alone..."
            : "...Could you go away?";
        s.dialogSystem.showSequence([{ speaker: '???', text: line }], () => s.dialogSystem.close());
    }

    // Encourager CNPC (-41,66): 第一次长台词, 之后短鼓励
    _sz3EncourageNpcInteract() {
        const s = this;
        if (s.dialogSystem && s.dialogSystem.isOpen) return;
        if (s._sz3EncouragedOnce) {
            s.dialogSystem.showSequence([
                { speaker: '???', text: "Keep going! You can do it!" }
            ], () => s.dialogSystem.close());
        } else {
            s._sz3EncouragedOnce = true;
            s.dialogSystem.showSequence([
                { speaker: '???', text: "Oh? A brave adventurer? Keep at it — I believe in you. Maybe you're our hope..." }
            ], () => s.dialogSystem.close());
        }
    }

    _sz3AmberInteract() {
        const s = this;
        if (s.dialogSystem && s.dialogSystem.isOpen) return;

        // 任务已完成 — 简短问候, 不再要求水晶
        if (s._pickaxeUpgraded) {
            s.dialogSystem.showSequence([
                { speaker: 'Amber', text: "Glad to see the upgrade's holding up. Swing easy out there." }
            ], () => s.dialogSystem.close());
            return;
        }

        // 第一次见面
        if (!s._amberTalkedOnce) {
            s._amberTalkedOnce = true;
            s.dialogSystem.showSequence([
                { speaker: 'Amber', text: "Oh? A new adventurer? My name is Amber." },
                { speaker: 'Amber', text: "Could you collect 10 yellow crystals for me? I'll upgrade your pickaxe so it actually feels like a weapon." }
            ], () => s.dialogSystem.close());
            return;
        }

        // 第二次起 — yes/no 问任务进度
        s.dialogSystem.show({
            speaker: 'Amber',
            text: 'Do you have 10 yellow crystals?',
            choices: [
                { label: 'Yes', action: () => s._sz3AmberCheckYellowCrystals() },
                { label: 'No',  action: () => s._sz3AmberNotYet() }
            ]
        });
    }

    _sz3AmberNotYet() {
        const s = this;
        s.dialogSystem.close();
        s.dialogSystem.showSequence([
            { speaker: 'Amber', text: "Come find me once you have them. I'll be here." }
        ], () => s.dialogSystem.close());
    }

    _sz3AmberCheckYellowCrystals() {
        const s = this;
        s.dialogSystem.close();
        const have = (s.hudSystem && s.hudSystem.yellowCrystalCount) || 0;
        if (have < 10) {
            s.dialogSystem.showSequence([
                { speaker: 'Amber', text: "Not enough yet. Come back when you've got all 10." }
            ], () => s.dialogSystem.close());
            return;
        }
        // 够 — 扣 10 + 解锁
        if (s.hudSystem && s.hudSystem.spendYellowCrystal) {
            s.hudSystem.spendYellowCrystal(10);
        }
        s._pickaxeUpgraded = true;                          // 本场景立即生效
        s.registry.set('pickaxeUpgraded', true);            // 跨场景 (刷新自动清空)
        // #9 双手解锁 → 注册「投掷战斗 + 抓墙荡跃」引导 (持久化, 之后所有场景指南菜单都有)
        if (s.guideSystem && s.guideSystem.registerDualHandGuides) {
            s.guideSystem.registerDualHandGuides();
        }
        console.log('[Amber] Pickaxe upgraded — throw/recall/grapple/hand-switch unlocked. _pickaxeUpgraded =', s._pickaxeUpgraded);
        s.dialogSystem.showSequence([
            { speaker: 'Amber', text: "Thank you. Here — your pickaxe, sharpened and reinforced. Give it a swing." },
            { speaker: 'Amber', text: "Throw it with Right Click, swap hands with F. You'll feel the difference." }
        ], () => s.dialogSystem.close());
    }

    // ============================================================
    // === Citrine 骗子任务 (3 阶段收集 + 逃跑 cutscene + 道歉) ===
    // ============================================================
    _sz3CitrineInteract() {
        const s = this;
        if (s.dialogSystem && s.dialogSystem.isOpen) return;

        const phase = s._citrinePhase || 'fresh';

        if (phase === 'fresh') {
            s._citrinePhase = 'collect5';
            s.dialogSystem.showSequence([
                { speaker: 'Citrine', text: "Hehehe, new face here? Name's Citrine." },
                { speaker: 'Citrine', text: "Be a pal and bring me 5 yellow crystals? I'll make it worth your while, hehehe." }
            ], () => s.dialogSystem.close());
            return;
        }

        if (phase === 'collect5') {
            s.dialogSystem.show({
                speaker: 'Citrine', text: 'Got those 5 yellow crystals for me, hehehe?',
                choices: [
                    { label: 'Yes', action: () => s._sz3CitrineCheck(5, 'collect10') },
                    { label: 'No',  action: () => s._sz3CitrineNotYet() }
                ]
            });
            return;
        }
        if (phase === 'collect10') {
            s.dialogSystem.show({
                speaker: 'Citrine', text: 'Got those 10 yellow crystals yet, hehehe?',
                choices: [
                    { label: 'Yes', action: () => s._sz3CitrineCheck(10, 'collect20') },
                    { label: 'No',  action: () => s._sz3CitrineNotYet() }
                ]
            });
            return;
        }
        if (phase === 'collect20') {
            s.dialogSystem.show({
                speaker: 'Citrine', text: 'Got those 20 yellow crystals yet, hehehe?',
                choices: [
                    { label: 'Yes', action: () => s._sz3CitrineCheck(20, 'cutscene') },
                    { label: 'No',  action: () => s._sz3CitrineNotYet() }
                ]
            });
            return;
        }
        // 'fled' — 玩家在 (-42, 37) 找到他: 道歉
        if (phase === 'fled') {
            s._sz3CitrineApology();
            return;
        }
        // 'done' — 已道歉, 重复对话
        s.dialogSystem.showSequence([
            { speaker: 'Citrine', text: "I'm sorry... I won't trick anyone again..." }
        ], () => s.dialogSystem.close());
    }

    _sz3CitrineNotYet() {
        const s = this;
        s.dialogSystem.close();
        s.dialogSystem.showSequence([
            { speaker: 'Citrine', text: "Then come find me when you've got 'em, hehe." }
        ], () => s.dialogSystem.close());
    }

    _sz3CitrineCheck(amount, nextPhase) {
        const s = this;
        s.dialogSystem.close();
        const have = (s.hudSystem && s.hudSystem.yellowCrystalCount) || 0;
        if (have < amount) {
            s.dialogSystem.showSequence([
                { speaker: 'Citrine', text: "Not enough yet. Come back when you've got the rest, hehehe." }
            ], () => s.dialogSystem.close());
            return;
        }
        // 够 — 扣 + 推进阶段
        if (s.hudSystem && s.hudSystem.spendYellowCrystal) s.hudSystem.spendYellowCrystal(amount);
        s._citrinePhase = nextPhase;
        // 不同阶段不同回应
        if (nextPhase === 'collect10') {
            s.dialogSystem.showSequence([
                { speaker: 'Citrine', text: "*eyes darting* ...You took your time, didn't you? Tell you what — bring me 10 more yellow crystals, then I'll hand over what you want, hehehe." }
            ], () => s.dialogSystem.close());
        } else if (nextPhase === 'collect20') {
            s.dialogSystem.showSequence([
                { speaker: 'Citrine', text: "Hmm. Thinking it over... still not enough. Bring me 20 more — last time, I swear on it." },
                { speaker: 'You',     text: "...You sure?" },
                { speaker: 'Citrine', text: "Like I said, I swear, hehe." }
            ], () => s.dialogSystem.close());
        } else if (nextPhase === 'cutscene') {
            s.dialogSystem.showSequence([
                { speaker: 'Citrine', text: "Right then. Don't tell a soul about this, hehe. Walk over and check that wall." }
            ], () => {
                s.dialogSystem.close();
                s.time.delayedCall(300, () => s._sz3CitrineRunCutscene());
            });
        }
    }

    // === 跑路 cutscene ===
    _sz3CitrineRunCutscene() {
        const s = this;
        s._cinematicLock = true;
        // (用户) 空中触发保护: 走位 tween 只动 X 且每帧 reset 清掉重力速度 — 空中触发 = 锁高度平飞.
        //   先锁输入等玩家自然落地, 落地后再开始押送; 3s 兜底防极端卡死.
        const b = s.player.body;
        if (b && !b.blocked.down) {
            b.setVelocityX(0);   // 收水平速度, 垂直交给重力自然下落
            const ev = s.time.addEvent({ delay: 50, loop: true, callback: () => {
                if (s.player.body && s.player.body.blocked.down) { ev.remove(); this._sz3CitrineWalkPhase(); }
            }});
            s.time.delayedCall(3000, () => { try { ev.remove(); } catch (e) {} this._sz3CitrineWalkPhase(); });
            return;
        }
        this._sz3CitrineWalkPhase();
    }

    _sz3CitrineWalkPhase() {
        const s = this;
        if (s._citrineWalkStarted) return;   // 兜底与落地轮询可能双触发, 只走一次
        s._citrineWalkStarted = true;
        const G = 32;
        const cam = s.cameras.main;
        // 暂存原 zoom
        s._citrineSavedZoom = cam.zoom;
        cam.stopFollow();
        cam.zoomTo(2.5, 800, 'Power2', true);
        cam.startFollow(s.player, true, 0.1, 0.1);

        // 第 1 步: 玩家强制走到 (-29, 54), 面向右 (往右走 → flipX=false)
        // (-28 会让右下角卡进 (-27,55) 的墙, 改 -29 留出 1 格间隙)
        const targetX = -29 * G + G / 2;
        s.player.body && s.player.body.setVelocity(0, 0);
        s.player.flipX = false;
        if (s.anims.exists('run')) { try { s.player.play('run', true); } catch(e) {} }
        s._forceStepKey = 'GrassRun';   // (用户) 剧情走位脚步
        s.tweens.add({
            targets: s.player, x: targetX, duration: 1500, ease: 'Linear',
            onUpdate: () => {
                if (s.player.body) s.player.body.reset(s.player.x, s.player.y);
                // (用户) 走路动画每帧重申 — 押送期间有未知路径会把 run 摁掉 (蝙蝠破图同款防御)
                const _pa = s.player.anims;
                if (s.anims.exists('run') && (!_pa.currentAnim || _pa.currentAnim.key !== 'run' || !_pa.isPlaying)) {
                    try { s.player.play('run', true); } catch (e) {}
                }
            },
            onComplete: () => {
                s._forceStepKey = null;   // (用户) 走位结束收脚步
                if (s.player.body) s.player.body.setVelocity(0, 0);
                if (s.anims.exists('idle')) { try { s.player.play('idle', true); } catch(e) {} }
                // 玩家到位后 → 第 2 步: Citrine 才开始跑
                s._sz3CitrineFlee();
            }
        });
    }

    // 第 2 步: Citrine 向左滑 10 格 (1s) → 消失 → 瞬移到 (-42, 37) → 完了进对话
    _sz3CitrineFlee() {
        const s = this;
        const G = 32;
        if (!s._sz3Citrine || !s._sz3Citrine.sprite) {
            // 没有 Citrine sprite, 直接进对话
            s._sz3CitrineCutscenePhase2();
            return;
        }
        const cspr = s._sz3Citrine.sprite;
        const cTargetX = -41 * G + G / 2;  // 当前 -31 → -41 (左 10 格)
        cspr.flipX = false;  // 朝左
        if (typeof AudioSystem !== 'undefined' && AudioSystem.npcWalkLoop) AudioSystem.npcWalkLoop(s, 1000, 'GrassRun', AudioSystem.sfxVolume * 0.9);   // (用户) Citrine 跑路脚步 (玩家真音轨, 略轻)
        s.tweens.add({
            targets: cspr, x: cTargetX, duration: 1000, ease: 'Linear',
            onUpdate: () => { s._sz3Citrine.x = cspr.x; },
            onComplete: () => {
                // 消失 + 瞬移到 (-42, 37)
                cspr.setVisible(false);
                s.time.delayedCall(200, () => {
                    cspr.x = -42 * G + G / 2;
                    cspr.y = 37 * G + G / 2;
                    if (cspr.body) cspr.body.reset(cspr.x, cspr.y);
                    s._sz3Citrine.x = cspr.x;
                    s._sz3Citrine.y = cspr.y;
                    cspr.flipX = true;
                    cspr.setVisible(true);
                    // Citrine 跑完 → 进玩家对话
                    s._sz3CitrineCutscenePhase2();
                });
            }
        });
    }

    _sz3CitrineCutscenePhase2() {
        const s = this;
        // Citrine 已经跑掉, 玩家原地等 0.8 秒再说话
        s.time.delayedCall(800, () => {
            // 玩家说话
            s.dialogSystem.showSequence([
                { speaker: 'You', text: '(Is there something here?)' },
                { speaker: 'You', text: '...' },
                { speaker: 'You', text: 'Citrine?' }
            ], () => {
                // 主角面向左 (本作约定: flipX=true=朝左 — 原来写 false 其实在朝右)
                s.player.flipX = true;
                s._sz3CitrineCutscenePhase3();
            });
        });
    }

    _sz3CitrineCutscenePhase3() {
        const s = this;
        const G = 32;
        const cam = s.cameras.main;
        // (用户) 镜头平移到格 (-37,54) 中心再回玩家 (原"往左3格"贴边界看不出动)
        const px = s.player.x, py = s.player.y;
        cam.stopFollow();
        cam.pan(-37 * G + G / 2, 54 * G + G / 2, 800, 'Quad.easeInOut');
        s.time.delayedCall(900, () => {
            cam.pan(px, py, 600, 'Quad.easeInOut');
            s.time.delayedCall(700, () => {
                cam.startFollow(s.player, true, 0.1, 0.1);
                // 玩家继续说话
                s.dialogSystem.showSequence([
                    { speaker: 'You', text: '(...Where did he go?)' },
                    { speaker: 'You', text: "(Damn it — I've been tricked!)" },
                    { speaker: 'You', text: "(I'm hunting him down!!)" }
                ], () => {
                    s._sz3CitrineEndCutscene();
                });
            });
        });
    }

    _sz3CitrineEndCutscene() {
        const s = this;
        const cam = s.cameras.main;
        cam.zoomTo(s._citrineSavedZoom || 2, 600, 'Power2', true);
        s.time.delayedCall(700, () => {
            s._cinematicLock = false;
            s._citrinePhase = 'fled';
            // (用户) 不再永久恐惧 — update 里按距离切换: 5 格内哭, 远离回普通站立, 道歉完成后永不哭
        });
    }

    // === 玩家在 (-42, 37) 找到 Citrine: 道歉 ===
    _sz3CitrineApology() {
        const s = this;
        const G = 32;
        s.dialogSystem.showSequence([
            { speaker: 'Citrine', text: "...H-how did you find me? *trembling*" },
            { speaker: 'You',     text: "...I think I deserve an explanation, don't you?" }
        ], () => {
            // Citrine 面向玩家 (玩家在右, citrine 朝右 = flipX=true), 移动到 (-43, 37)
            if (s._sz3Citrine && s._sz3Citrine.sprite) {
                s._sz3Citrine.sprite.flipX = true;
                s.tweens.add({
                    targets: s._sz3Citrine.sprite, x: -43 * G + G / 2, duration: 600, ease: 'Linear',
                    onUpdate: () => { s._sz3Citrine.x = s._sz3Citrine.sprite.x; },
                    onComplete: () => {
                        s._sz3Citrine.x = s._sz3Citrine.sprite.x;
                        s.dialogSystem.showSequence([
                            { speaker: 'Citrine', text: "I... I... I'm sorry... Here's what you came for — doubled, even. I was wrong... *Mysterious Key +2*" },
                            { speaker: 'You',     text: "*staring at him* ..." },
                            { speaker: 'You',     text: "Don't let it happen again." },
                            { speaker: 'Citrine', text: "O-okay..." }
                        ], () => {
                            // 给玩家 2 把钥匙 — 走背包 (跟 Tutorial 商人/SZ1 骷髅同套)
                            if (s.inventorySystem && s.inventorySystem.addItem) {
                                s.inventorySystem.addItem('key', 2);
                            }
                            if (s._sz3Citrine) s._sz3Citrine.setFear(false);   // 拿到钥匙 → 变回 idle
                            s._citrinePhase = 'done';
                            s.dialogSystem.close();
                        });
                    }
                });
            } else {
                s.dialogSystem.close();
            }
        });
    }

    // ============================================================
    // === 姐妹 (Mica 姐 / Mira 妹) 交互 + 45s 巡逻 ===
    // ============================================================
    // 共享对话: _sisterDialogState = 'first' | 'normal' | 'scared'
    _sz3SisterInteract() {
        const s = this;
        if (s.dialogSystem && s.dialogSystem.isOpen) return;
        // 注: 不再用 _sisterMoving 阻止交互 — 移动中也允许打断 (tween 由 caller 暂停)

        if (s._sisterDialogState === 'first') {
            // 第一次对话
            s.dialogSystem.showSequence([
                { speaker: '???', text: 'Hello... human?' },
                { speaker: 'You', text: "Hello, you two. Good to meet you — what are your names?" },
                { speaker: 'Mica', text: 'My name is Mica.' },
                { speaker: 'Mira', text: "Um... I'm Mira. Sorry we mistook you for a mob earlier..." }
            ], () => {
                s.dialogSystem.show({
                    speaker: 'You',
                    text: '',
                    choices: [
                        { label: "It's alright, I don't mind.", action: () => s._sz3SisterForgive() },
                        { label: "It's fine — though they say misjudging things gets you snatched by mobs at night~", action: () => s._sz3SisterTease() }
                    ]
                });
            });
        } else if (s._sisterDialogState === 'scared') {
            // 被吓跑后的对话 (在 -37/-39)
            s.dialogSystem.showSequence([
                { speaker: 'Mira', text: "Sob... I don't want the mobs to take me..." },
                { speaker: 'Mica', text: "It's okay, Mira. I'll protect you..." },
                { speaker: 'You', text: "The mobs won't come, really. And if they do, I'll protect you both." },
                { speaker: 'Mira & Mica', text: 'Really? Thank you, mister!' },
                { speaker: 'Mica', text: 'If you ever need anything, just tell us!' },
                { speaker: 'Mira', text: 'Mhm mhm!' }
            ], () => {
                s._sisterDialogState = 'normal';
                s.dialogSystem.close();
            });
        } else {
            // normal: 重复那句
            s.dialogSystem.showSequence([
                { speaker: 'Mica', text: 'If you ever need anything, just tell us!' }
            ], () => s.dialogSystem.close());
        }
    }

    _sz3SisterForgive() {
        const s = this;
        s.dialogSystem.close();
        s.dialogSystem.showSequence([
            { speaker: 'Mica', text: 'Thank you for forgiving us. If you ever need anything, just tell us.' },
            { speaker: 'Mira', text: 'Mhm mhm!' }
        ], () => {
            s._sisterDialogState = 'normal';
            s.dialogSystem.close();
        });
    }

    _sz3SisterTease() {
        const s = this;
        s.dialogSystem.close();
        // 立即设 scared, 这样 tease-run 中玩家追上来也不会触发 first 对话
        s._sisterDialogState = 'scared';
        // 标记 tease 跑路中 — 期间不显 E 图标, 不可交互
        s._sisterTeaseRunning = true;
        // 姐妹尖叫 + 跑到 (-37, -39, 30)
        s.dialogSystem.showSequence([
            { speaker: 'Mira & Mica', text: 'WAAAHHH!!!' }
        ], () => {
            s.dialogSystem.close();
            s._sz3SistersRunTo('right', () => {
                // 到达 right 组后, E 交互恢复
                s._sisterTeaseRunning = false;
            });
        });
    }

    // 姐妹跑到指定位置组 — 4 秒单程
    //   'statue': Mira(-64) Mica(-62) — 神像左
    //   'middle': Mira(-48) Mica(-46) — 中间
    //   'right':  Mira(-39) Mica(-37) — 右
    _sz3SistersRunTo(group, onDone) {
        const s = this;
        const G = 32;
        s._sisterMoving = true;
        s._sisterTweens = [];  // 存 tween 引用 (供 pause/resume)
        const cols = group === 'statue' ? { mira: -64, mica: -62 }
                   : group === 'middle' ? { mira: -48, mica: -46 }
                   : { mira: -39, mica: -37 };
        const pairs = [
            { npc: s._sz3CNpc2, col: cols.mira },  // Mira 妹
            { npc: s._sz3CNpc3, col: cols.mica }   // Mica 姐
        ];
        let done = 0;
        pairs.forEach(({ npc, col }) => {
            if (!npc || !npc.sprite) { done++; return; }
            const targetX = col * G + G / 2;
            const movingLeft = targetX < npc.sprite.x;
            npc.sprite.flipX = !movingLeft;  // 朝移动方向
            // 距离 → duration: 全程标准 ~25 cell = 4s, 距离短时按比例算 (最少 1.5s)
            const distCells = Math.abs(targetX - npc.sprite.x) / G;
            const duration = Math.max(1500, distCells * 160);  // ~160ms/cell
            const tw = s.tweens.add({
                targets: npc.sprite, x: targetX, duration: duration, ease: 'Linear',
                onUpdate: () => { npc.x = npc.sprite.x; },
                onComplete: () => {
                    npc.x = npc.sprite.x;
                    npc.sprite.flipX = true;  // 站定朝右
                    done++;
                    if (done === 2) {
                        s._sisterMoving = false;
                        s._sisterTweens = [];
                        s._sisterPatrolAt = group;
                        if (onDone) onDone();
                    }
                }
            });
            s._sisterTweens.push(tw);
        });
    }

    // 暂停姐妹 tween (玩家中途交互)
    _sz3PauseSisterTweens() {
        if (!this._sisterTweens || this._sisterTweens.length === 0) return;
        this._sisterTweens.forEach(t => {
            if (t && t.isPlaying && t.isPlaying()) t.pause();
        });
        this._sisterTweensPaused = true;
        this._sisterResumeAt = 0;  // 取消旧的 1s 等待 (新交互重新计时)
    }
    // 恢复姐妹 tween (对话结束后继续行程)
    _sz3ResumeSisterTweens() {
        if (!this._sisterTweens || this._sisterTweens.length === 0) {
            this._sisterTweensPaused = false;
            return;
        }
        this._sisterTweens.forEach(t => {
            if (t && t.isPaused && t.isPaused()) t.resume();
        });
        this._sisterTweensPaused = false;
    }

    // 15-45s 随机巡逻: 3 位置随机抽下一个 (不同当前)
    _sz3UpdateSisterPatrol(delta) {
        const s = this;
        if (!s._sistersIntroRun) return;       // 开局跑路还没完
        if (s._sisterDialogState !== 'normal') return;  // 必须冷静下来 (normal 状态) 才巡逻
        if (s._sisterMoving) return;            // 跑动中
        if (s.dialogSystem && s.dialogSystem.isOpen) return;
        if (s._cinematicLock) return;
        if (!s._sisterPatrolInterval) {
            s._sisterPatrolInterval = 15000 + Math.random() * 30000;  // 15-45s
        }
        s._sisterPatrolTimer += delta;
        if (s._sisterPatrolTimer >= s._sisterPatrolInterval) {
            s._sisterPatrolTimer = 0;
            s._sisterPatrolInterval = 15000 + Math.random() * 30000;  // 下次新的随机间隔
            // 从 3 位置 - 当前位置 中随机抽 1 个
            const all = ['statue', 'middle', 'right'];
            const others = all.filter(g => g !== s._sisterPatrolAt);
            const target = others[Math.floor(Math.random() * others.length)];
            s._sz3SistersRunTo(target);
        }
    }

    // 姐妹 + Cryst 的 E 图标显示 + E 交互 — 必须在 interactSystem.update 之前调用
    // (因为 InteractSystem 开头会 JustDown(keyE) 消耗按键, 一帧一次)
    _sz3UpdateSpecialNpcInteract(delta) {
        const s = this;
        if (s._cinematicLock) {
            // 剧情期间隐藏所有特殊 NPC 的 E 图标 (否则 Chief 走路/商人钻出时 E 会卡在空中)
            [s._sz3Cryst, s._sz3CNpc2, s._sz3CNpc3].forEach(n => { if (n && n.eIcon) n.eIcon.setVisible(false); });
            return;
        }
        const inDialog = s.dialogSystem && s.dialogSystem.isOpen;
        // 上下漂浮偏移 — 仿商人 E 图标 tween (y -=10, 600ms, yoyo, Sine.easeInOut)
        // 等效公式: 周期 1200ms, 从 0 缓动到 -10 再回到 0, 反复
        const _cycle = 1200;
        const _phase = (s.time.now % _cycle) / _cycle;
        const floatOff = -(1 - Math.cos(_phase * 2 * Math.PI)) / 2 * 10;

        // === Cryst 重复交互 ===
        if (s._sz3Cryst && s._sz3CrystTalkedOnce) {
            const cx = s._sz3Cryst.sprite ? s._sz3Cryst.sprite.x : s._sz3Cryst.x;
            const cy = s._sz3Cryst.sprite ? s._sz3Cryst.sprite.y : s._sz3Cryst.y;
            const dist = Phaser.Math.Distance.Between(s.player.x, s.player.y, cx, cy);
            const near = dist <= 64;
            if (s._sz3Cryst.eIcon) {
                s._sz3Cryst.eIcon.x = cx;
                s._sz3Cryst.eIcon.y = cy - 40 + floatOff;  // 漂浮
                s._sz3Cryst.eIcon.setVisible(near && !inDialog);
            }
            if (near && !inDialog && s.keyE && Phaser.Input.Keyboard.JustDown(s.keyE)) {
                s._sz3CrystInteract();
                return;  // E 已消耗
            }
        }

        // === 姐妹交互: 1 个共享 E 图标在两人中间头顶, 漂浮 ===
        if (s._sistersIntroRun) {
            const m1 = s._sz3CNpc2;  // Mira 妹
            const m2 = s._sz3CNpc3;  // Mica 姐
            // 隐藏 Mica 的 eIcon, 借用 Mira 的作共享图标
            if (m2 && m2.eIcon) m2.eIcon.setVisible(false);

            let nearAny = false;
            if (m1 && m1.sprite && m2 && m2.sprite) {
                const d1 = Phaser.Math.Distance.Between(s.player.x, s.player.y, m1.sprite.x, m1.sprite.y);
                const d2 = Phaser.Math.Distance.Between(s.player.x, s.player.y, m2.sprite.x, m2.sprite.y);
                const minD = Math.min(d1, d2);
                nearAny = minD <= 64;
                // 共享图标位置: 两人中间 + 取较高头顶 (y 较小者)
                if (m1.eIcon) {
                    const midX = (m1.sprite.x + m2.sprite.x) / 2;
                    const topY = Math.min(m1.sprite.y, m2.sprite.y) - 40;
                    m1.eIcon.x = midX;
                    m1.eIcon.y = topY + floatOff;  // 漂浮
                    // tease 跑路中 → 完全隐藏 E (不可交互)
                    const allowInteract = !s._sisterTeaseRunning;
                    m1.eIcon.setVisible(nearAny && !inDialog && allowInteract);
                }
            }
            if (nearAny && !inDialog && !s._sisterTeaseRunning && s.keyE && Phaser.Input.Keyboard.JustDown(s.keyE)) {
                if (s._sisterMoving) s._sz3PauseSisterTweens();
                s._sz3SisterInteract();
                return;  // E 已消耗
            }
            // 对话已关闭 + 之前暂停过 tween → 停 1 秒后恢复行程
            if (!inDialog && s._sisterTweensPaused) {
                if (!s._sisterResumeAt) {
                    s._sisterResumeAt = s.time.now + 1000;  // 对话刚关, 等 1s
                }
                if (s.time.now >= s._sisterResumeAt) {
                    s._sz3ResumeSisterTweens();
                    s._sisterResumeAt = 0;
                }
            }
            // 巡逻 (仅 normal 状态)
            s._sz3UpdateSisterPatrol(delta);
        }
    }

    // === 商人从地底钻出 (参考 SZ2) — at (-53, 30) [往右 1 格] ===
    _sz3SpawnMerchantRise() {
        const s = this;
        // 等待 checkpoint 激活对话 (或任何对话) 关闭后再钻出, 避免对话撞车
        if (s.dialogSystem && s.dialogSystem.isOpen) {
            s.time.delayedCall(500, () => s._sz3SpawnMerchantRise());
            return;
        }
        if (s._sz3MerchantSpawned) return;
        s._sz3MerchantSpawned = true;
        const G = 32;
        const finalX = -53 * G + G / 2;  // 往右 1 格 (-54 → -53)
        const finalY = 30 * G + G / 2 + 11;  // +11 px 下移 (跟 SZ2 一样)

        if (typeof MoleTrader === 'undefined') {
            console.warn('[SZ3] MoleTrader undefined');
            return;
        }
        s.moleTrader = new MoleTrader(s, finalX, finalY);
        if (s.walls) s.physics.add.collider(s.moleTrader, s.walls);
        if (s.uiCam) {
            try { s.uiCam.ignore(s.moleTrader); } catch(e) {}
            try { s.uiCam.ignore(s.moleTrader.interactionIcon); } catch(e) {}
        }
        if (s.textures.exists('Trader_dig') && !s.anims.exists('trader_dig')) {
            s.anims.create({
                key: 'trader_dig',
                frames: s.anims.generateFrameNumbers('Trader_dig', { start: 0, end: 21 }),
                frameRate: 11, repeat: 0
            });
        }
        // 镜头 zoom 2x + 对焦
        s._cinematicLock = true;
        s._sz3SavedZoom = s.cameras.main.zoom;
        if (s.player && s.player.body) s.player.body.setVelocityX(0);
        if (s.player && s.anims.exists('idle') && s.player.play) s.player.play('idle', true);
        const cam = s.cameras.main;
        cam.stopFollow();
        s.tweens.add({ targets: cam, zoom: 2.0, duration: 600, ease: 'Quad.easeOut' });
        cam.pan(finalX, finalY, 600, 'Quad.easeOut');

        // dig 动画反向播 (从地底升起), 跟 SZ2 同款偏移: dig 位置 (finalX, finalY+8), scale 57.6
        s.moleTrader.setTexture('Trader_dig', 0);
        s.moleTrader.setDisplaySize(48 * 1.2, 48 * 1.2);
        s.moleTrader.setPosition(finalX, finalY + 8);
        if (s.moleTrader.body) {
            s.moleTrader.body.setAllowGravity(false);
            s.moleTrader.body.enable = false;
        }
        // (用户) 检测到 trader_dig 动画播放 (反向/正向都算) → 播 MoleDig. 文件须在 assets/audio/NPC/MoleDig.wav
        if (s.moleTrader && !s.moleTrader._digSndHooked) {
            s.moleTrader._digSndHooked = true;
            s.moleTrader.on(Phaser.Animations.Events.ANIMATION_START, (anim) => {
                if (anim && anim.key === 'trader_dig' && typeof AudioSystem !== 'undefined') AudioSystem.sfx(s, 'MoleDig');
            });
        }
        if (s.anims.exists('trader_dig')) {
            if (typeof s.moleTrader.playReverse === 'function') s.moleTrader.playReverse('trader_dig');
            else if (typeof s.moleTrader.play === 'function') s.moleTrader.play('trader_dig');
        }

        // (用户) 钻洞声播完 → 切 stand + 对话 (无声/缺文件兜底 8s)
        const _toStand = () => {
            if (s._moleEmergeDone) return; s._moleEmergeDone = true;
            s.moleTrader.setTexture('Trader_stand');
            s.moleTrader.setScale(1);
            s.moleTrader.setPosition(finalX, finalY + 10);  // stand 位置 +10 px (跟 SZ2)
            if (s.moleTrader.body) {
                s.moleTrader.body.enable = true;
                s.moleTrader.body.setAllowGravity(true);
                s.moleTrader.body.reset(finalX, finalY + 10);
            }
            if (s.anims.exists('trader_stand') && s.moleTrader.play) s.moleTrader.play('trader_stand');
            s._sz3MerchantDialog();
        };
        s.time.delayedCall(2200, _toStand);
    }

    _sz3MerchantDialog() {
        const s = this;
        if (!s.dialogSystem) { s._endSZ3MerchantCutscene(); return; }
        s.dialogSystem.showSequence([
            { speaker: 'Whisker', text: 'A human in the Crystal City? Now I have seen everything.' },
            { speaker: 'Whisker', text: "Stick around, friend. I carry wares you won't find anywhere else." },
            { speaker: 'Whisker', text: 'Come trade whenever you are ready.' }
        ], () => s._endSZ3MerchantCutscene());
    }

    _endSZ3MerchantCutscene() {
        const s = this;
        const cam = s.cameras.main;
        const z0 = s._sz3SavedZoom || 2;
        s.tweens.add({ targets: cam, zoom: z0, duration: 500, ease: 'Quad.easeInOut' });
        if (s.player) cam.startFollow(s.player, true, 0.1, 0.1);
        s.time.delayedCall(550, () => { s._cinematicLock = false; });
    }

    _sz3IntroFinish() {
        const s = this;
        s._sz3IntroPhase = 9;
        s._sz3IntroStarted = false;
        s._cinematicLock = false;
        // 镜头还原 zoom + bounds + follow
        const cam = s.cameras.main;
        cam.zoomTo(2, 1000, 'Power2', true);
        if (s._sz3OrigBounds) {
            cam.setBounds(s._sz3OrigBounds.x, s._sz3OrigBounds.y, s._sz3OrigBounds.width, s._sz3OrigBounds.height);
        }
        cam.startFollow(s.player, true, 0.1, 0.1);
        // HUD 恢复
        if (s.hudSystem && s.hudSystem.setHUDVisible) s.hudSystem.setHUDVisible(true);
        // CNPCs 可交互
        if (s._sz3CNpc2) s._sz3CNpc2._cinematicMode = false;
        if (s._sz3CNpc3) s._sz3CNpc3._cinematicMode = false;
        if (s._sz3Cryst) s._sz3Cryst._cinematicMode = false;
    }

    _applyInheritedState() {
        const data = this._inheritedData || {};
        // (用户) 一次性剧情完成标志随档恢复 — 防止已读剧情重播/触发器卡死玩家
        if (data.plotFlags) { try { for (const k in data.plotFlags) { if (data.plotFlags[k] === true && !/CutsceneStarted$/.test(k)) this[k] = true; } } catch (e) {} }   // (用户) Started 瞬态不恢复 (兼容老档)
        if (typeof data.playMs === 'number') { this._playMsBase = data.playMs; this._playStartAt = Date.now(); }   // (用户) 局内时间随档续算
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
        // (用户) 黄水晶继承 — 修换场景丢计数/丢显示
        if (typeof data.yellowCrystalCount === 'number' && this.hudSystem) {
            this.hudSystem.yellowCrystalCount = data.yellowCrystalCount;
            if (data.yellowCrystalShown) this.hudSystem.yellowCrystalShown = false;   // 让 addYellowCrystal(0) 走显示路径
            if (this.hudSystem.addYellowCrystal) this.hudSystem.addYellowCrystal(0);
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
        // stand_up 起身动画 (落地剧情) — 完整 + 分段 (p1: 0-13, p2: 13-29)
        safeCreate('stand_up',    'Miner_stand_up', { start: 0,  end: 29 }, 7.5, 0);
        safeCreate('stand_up_p1', 'Miner_stand_up', { start: 0,  end: 13 }, 7.5, 0);
        safeCreate('stand_up_p2', 'Miner_stand_up', { start: 13, end: 29 }, 7.5, 0);
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

    // ── (用户) SZ3 双轨 BGM: yellowdirt 多→UpperHalf, 原皮 wall 多→LowerHalf; 满↔无各 5 秒; 附近都没有→维持上次 ──
    _sz3BgmUpdate(time, delta) {
        if (typeof AudioSystem === 'undefined' || !this.player) return;
        // 轨道懒创建 (音频异步加载完成后 cache 才有) + 场景退出清理
        if (!this._sz3Up && this.cache.audio.exists('bgm_SZ3_Upper')) { this._sz3Up = this.sound.add('bgm_SZ3_Upper', { loop: true, volume: 0 }); try { this._sz3Up.play(); } catch (e) {} }
        if (!this._sz3Low && this.cache.audio.exists('bgm_SZ3_Lower')) { this._sz3Low = this.sound.add('bgm_SZ3_Lower', { loop: true, volume: 0 }); try { this._sz3Low.play(); } catch (e) {} }
        if (!this._sz3BgmCleanHooked) {
            this._sz3BgmCleanHooked = true;
            this.events.once('shutdown', () => {
                [this._sz3Up, this._sz3Low].forEach(snd => { if (snd) { try { snd.stop(); snd.destroy(); } catch (e) {} } });
                this._sz3Up = this._sz3Low = null; this._sz3SkinWalls = null; this._sz3YellowSet = null; this._sz3BgmCleanHooked = false;
            });
        }
        // 0.8s 一次占比判定
        if (!this._sz3BgmNext || time >= this._sz3BgmNext) {
            this._sz3BgmNext = time + 800;
            if (!this._sz3SkinWalls) {   // 墙皮缓存 — create 换皮全部完成后建一次
                this._sz3SkinWalls = [];
                this._sz3YellowSet = new Set();   // (用户) 脚步声查询: 黄土格 'x,y'
                this.children.list.forEach(o => {
                    const k = o && o.texture && o.texture.key;
                    if (!k) return;
                    if (k.startsWith('Yellow_dirt_')) { this._sz3SkinWalls.push({ x: o.x, y: o.y, yl: true }); this._sz3YellowSet.add(o.x + ',' + o.y); }
                    else if (k.startsWith('Cavetile_wall_')) this._sz3SkinWalls.push({ x: o.x, y: o.y, yl: false });
                });
            }
            const R2 = 160 * 160;   // 5 格半径
            let ny = 0, nc = 0;
            const px = this.player.x, py = this.player.y;
            for (let i = 0; i < this._sz3SkinWalls.length; i++) {
                const w = this._sz3SkinWalls[i];
                const dx = w.x - px, dy = w.y - py;
                if (dx * dx + dy * dy > R2) continue;
                if (w.yl) ny++; else nc++;
            }
            if (ny > nc) this._sz3BgmWant = 'up';
            else if (ny < nc) this._sz3BgmWant = 'low';
            // ny === nc (含两者皆 0) → 维持上次判定
        }
        // 每帧朝目标"混音比"推进 (0↔1 各 5000ms); 实际音量 = 混音比 × 实时设置音量
        //   (用户修复) 旧版直接 lerp 音量且步长 ∝ 音量: 滑块调小要几十秒才跟上;
        //   调到 0 时步长被 0.0001 地板托住 → 0.5 爬到 0 要 ~150 万帧 = 音乐永远关不掉.
        //   解耦后: 交叉淡变节奏固定 5s, 设置滑块即时全幅生效 (含 0 = 立即静音).
        const maxV = AudioSystem.bgmVolume;
        const step = delta / 5000;
        const move = (snd, on) => {
            if (!snd) return;
            if (snd._mix === undefined) snd._mix = snd.volume > 0 ? 1 : 0;
            const tgt = on ? 1 : 0;
            if (Math.abs(snd._mix - tgt) <= step) snd._mix = tgt;
            else snd._mix += (tgt > snd._mix ? step : -step);
            snd.setVolume(snd._mix * maxV);
        };
        move(this._sz3Up,  this._sz3BgmWant === 'up');
        move(this._sz3Low, this._sz3BgmWant === 'low');
    }

    update(time, delta) {
        this._sz3BgmUpdate(time, delta);
        if (this._uiPaused) return;   // (用户) 设置/guide 打开 → 全场景暂停
        if (!this.player.body) return;

        // (用户) Citrine 哭动画: 仅 fled 阶段且玩家 5 格 (160px) 内才哭; 远离/道歉完成 → 普通站立
        if (this._sz3Citrine && this._sz3Citrine.sprite && this._sz3Citrine.sprite.active) {
            if (this._citrinePhase === 'fled') {
                const _csp = this._sz3Citrine.sprite;
                const _cdx = _csp.x - this.player.x, _cdy = _csp.y - this.player.y;
                this._sz3Citrine.setFear(_cdx * _cdx + _cdy * _cdy <= 160 * 160);
            } else if (this._citrinePhase === 'apologized' || this._citrinePhase === 'done') {
                this._sz3Citrine.setFear(false);
            }
        }

        // Sign update
        if (this._storySigns) {
            this._storySigns.forEach(s => s.update());
        }
        // 重病精灵 interaction
        if (this._sz3DyingElf && !this._sz3ElfTalked) {
            const dx = this.player.x - this._sz3ElfPos.x;
            const dy = this.player.y - this._sz3ElfPos.y;
            const near = dx*dx + dy*dy < 60*60;
            if (this._sz3DyingElfEicon) this._sz3DyingElfEicon.setVisible(near);
            if (near && this.keyE && Phaser.Input.Keyboard.JustDown(this.keyE)) {
                if (this.dialogSystem) {
                    this.dialogSystem.show([
                        { speaker: 'Dying Elf', text: '...you... still warm. Not yet... one of us.' },
                        { speaker: 'Dying Elf', text: 'The blue glow... is not from this world. Something brought it.' },
                        { speaker: 'Dying Elf', text: '*coughs* End her... the mother... before you turn blue like us.' }
                    ]);
                }
                this._sz3ElfTalked = true;
            }
        }
        // 精灵长老 interaction
        if (this._sz3Elder) {
            const dx = this.player.x - this._sz3ElderPos.x;
            const dy = this.player.y - this._sz3ElderPos.y;
            const near = dx*dx + dy*dy < 60*60;
            if (this._sz3ElderEicon) this._sz3ElderEicon.setVisible(near);
            if (near && this.keyE && Phaser.Input.Keyboard.JustDown(this.keyE) && !this._sz3ElderTalked) {
                if (this.dialogSystem) {
                    this.dialogSystem.show([
                        { speaker: 'Elven Elder', text: "A human, here? You followed the blue, didn't you? We all did." },
                        { speaker: 'Elven Elder', text: 'This statue pushes back the corruption. It cannot cure you, but it slows the spread.' },
                        { speaker: 'Elven Elder', text: "Beyond this hall lies the spider's den. She is the mother of the blue." },
                        { speaker: 'Elven Elder', text: 'Slay her, and the cave heals. Fail, and you join us in glass and silence.' }
                    ]);
                }
                this._sz3ElderTalked = true;
            }
        }

        // 走到 (-36~-35, 113-115) → 传送到 SafeZone4 (KeyDoor 2 之后的区域)
        if (!this._teleportingToSafeZone4 &&
            this.player.x >= -36 * 32 && this.player.x <= -34 * 32 &&
            this.player.y >= 113 * 32 && this.player.y <= 116 * 32) {
            this._teleportingToSafeZone4 = true;
            const data = {
                crystalCount: this.hudSystem?.crystalCount,
                hp: this.healthSystem?.hp,
                maxHp: this.healthSystem?.maxHp,
                hearts: this.healthSystem?.hearts,
                hasHealthDetector: !!this._hasHealthDetector,
                yellowCrystalCount: this.hudSystem ? this.hudSystem.yellowCrystalCount : undefined,
                playMs: (typeof SaveSystem !== 'undefined' && SaveSystem._tickPlayMs) ? SaveSystem._tickPlayMs(this) : 0,   // (用户) 局内时间跨区传递
                yellowCrystalShown: !!(this.hudSystem && this.hudSystem.yellowCrystalShown),
                corrosionPct: this.diseaseSystem?.corrosionPct,
                inventorySlots: this.inventorySystem?.slots ? [...this.inventorySystem.slots] : null
            };
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.time.delayedCall(420, () => {
                this.scene.start('SafeZone4Scene', data);
            });
            return;
        }

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
        // Chest update — 必须放在 interactSystem.update 之前 (Phaser.JustDown 一帧一次)
        if (this._chests) this._chests.forEach(c => c.update());
        // 姐妹 + Cryst 交互 — 必须在 interactSystem.update 之前 (E 按键优先, JustDown 一帧一次)
        this._sz3UpdateSpecialNpcInteract(delta);
        // CrystalNpc update (Amber 等普通 NPC) — 也必须在 interactSystem.update 之前
        // (npc.update 内部会调 JustDown(keyE), 必须先于 interactSystem 抢)
        if (this._crystalNpcs) {
            this._crystalNpcs.forEach(npc => {
                // 姐妹 + Cryst: 只同步位置, 不调 npc.update (E 交互在 _sz3UpdateSpecialNpcInteract 已处理)
                if (npc === this._sz3CNpc2 || npc === this._sz3CNpc3 || npc === this._sz3Cryst) {
                    if (npc.sprite && npc.sprite.body) { npc.x = npc.sprite.x; npc.y = npc.sprite.y; }
                    return;
                }
                if (npc._cinematicMode) {
                    if (npc.sprite && npc.sprite.body) { npc.x = npc.sprite.x; npc.y = npc.sprite.y; }
                    if (npc.eIcon) { npc.eIcon.x = npc.x; npc.eIcon.y = npc.y - 40; npc.eIcon.setVisible(false); }
                } else if (npc.update) {
                    npc.update();
                }
            });
        }
        // Hint update (骷髅 hint) — 必须在 interactSystem.update 之前 (E 键 JustDown 一帧一次)
        if (this._hints) this._hints.forEach(h => h.update());

        // 宝箱掉落物拾取 (磁吸 + 入库) — SZ3 之前漏了这段, 导致捡不起
        if (this._chestDrops && this._chestDrops.length > 0) {
            this._chestDrops = this._chestDrops.filter(d => d && d.active);
            this._chestDrops.forEach(d => {
                if (!d.active || d._flying) return;
                if (d._pickupReadyAt && this.time.now < d._pickupReadyAt) return;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, d.x, d.y);
                if (dist <= 160) {
                    d._flying = true;
                    this.tweens.add({
                        targets: d, x: () => this.player.x, y: () => this.player.y,
                        duration: 250, ease: 'Cubic.easeIn',
                        onUpdate: () => { if (d.scale > 0.5) d.scale -= 0.02; },
                        onComplete: () => {
                            if (d._dropKind === 'crystal') {
                                if (this.hudSystem) this.hudSystem.addCrystal(1);
                            } else if (d._dropKind === 'potion') {
                                const t = d._dropType;
                                if (t === 'life_potion') {
                                    if (this.healthSystem) this.healthSystem.addHeart(1);
                                } else if (t === 'healing_potion' || t === 'health_potion') {
                                    if (this.inventorySystem) this.inventorySystem.addItem(t, 1);
                                }
                            }
                            if (this.inventorySystem) {
                                if (this.inventorySystem.refreshBackpack) this.inventorySystem.refreshBackpack();
                                if (this.inventorySystem.refreshQuick) this.inventorySystem.refreshQuick();
                            }
                            d.destroy();
                        }
                    });
                }
            });
        }

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
        }

        // 真稿子物理更新 (绳索/飞行/回收/grapple) — 跟 GameScene 同套
        this._updateRealPickaxes(time, delta);

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
        // === SZ3 开局剧情 update ===
        this._sz3IntroUpdate(time, delta);
        // CrystalNpc update — 移到 interactSystem.update 之前 (见上方)
        // 怪物 AI — 用 MainGameScene 共用过滤系统 (距离 20×12 + 跨 chunk)
        this._updateMonstersFiltered(time, delta);
        // chunk 镜头切换
        this._updateChunkCamera();
        // platform guide 触发
        this._checkPlatformGuide();
        // 检查 pending respawns
        this._checkPendingRespawns();
        // checkpoint hint + E 交互 + 靠近自动激发
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
        // 黄水晶磁吸拾取
        if (this.droppedYellowCrystals) {
            this.droppedYellowCrystals.getChildren().forEach(c => {
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
                            if (this.hudSystem) this.hudSystem.addYellowCrystal(1);
                        }
                    });
                }
            });
        }
    }

    _updateYellowDirtSpread(delta) {
        // SZ3 不使用黄土扩散 (SZ1/SZ2 boss 房专用效果). SZ3 现有同名 'zone2' 镜头区会误触发此逻辑导致崩溃 → 直接停用.
        const sp = this._yellowDirtSpread;
        if (sp) { sp.active = false; this._yellowDirtSpread = null; }
        return;
        const z2 = this._chunks.find(c => c.id === 'zone2');
        if (!z2) {
            sp.active = false;
            this._yellowDirtSpread = null;
            return;
        }
        sp.radius += (delta / 1000) * 5 * 32;
        const r2 = sp.radius * sp.radius;
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
        const markedCells = this._yellowDirtMarkedCells || [];
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
        // SZ3 自动激发: 靠近 (130 px) + 未激发 + 不在剧情/对话 → 自动调 _activate (跳过 E 确认)
        if (!cp.activated && !cp._activating && !this._cinematicLock && !inDialog && dist <= 130) {
            if (cp._activate) cp._activate();
        }
        // 已激发则不显 E 提示 (auto-activate, 玩家不用按 E)
        cp.setHintVisible(false);
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
        if (!this.player) return;
        // 前方半圆 RANGE=100 + 后方 BACK=32 (半身+0.5格), Y 自然受半圆约束
        const RANGE_SQ = 100 * 100, BACK = 40;
        const px = this.player.x, py = this.player.y;
        const facingRight = !this.player.flipX;
        const hitOre = (ore) => {
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
        };
        if (this._crystalOres) this._crystalOres.forEach(hitOre);
        if (this._yCrystalOres) this._yCrystalOres.forEach(hitOre);
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
        // 用 camBounds (融合镜头) 或 chunk 自身矩形; 仅当相机边界真正变化时才重设+重置中心 (跨融合区无缝)
        const cb = newChunk.camBounds || newChunk;
        const boundsKey = cb.x1 + ',' + cb.y1 + ',' + cb.x2 + ',' + cb.y2;
        this._currentChunkId = newChunk.id;
        if (boundsKey !== this._currentCamBoundsKey) {
            this._currentCamBoundsKey = boundsKey;
            const cam = this.cameras.main;
            const x1 = cb.x1 * 32;
            const y1 = cb.y1 * 32;
            const w  = (cb.x2 - cb.x1 + 1) * 32;
            const h  = (cb.y2 - cb.y1 + 1) * 32;
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
                // 也从 _wallCells dedup Set 移除 — 允许后续 wallRange/cavetileRange 重新在此格创建
                if (typeof _wallCells !== 'undefined') _wallCells.delete(c + ',' + r);
            }
        };
        const bgRange = (c1, r1, c2, r2) => {
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                new BackgroundBlock(this, c * G + G / 2, r * G + G / 2, G, G);
            }
        };
        // === 共享 wall cell tracking Set — 避免 O(N²) dedup ===
        const _wallCells = new Set();
        const wallRange = (c1, r1, c2, r2) => {
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                const key = c + ',' + r;
                if (_wallCells.has(key)) continue;
                _wallCells.add(key);
                new Wall(this, c * G + G / 2, r * G + G / 2, G, G);
            }
        };
        const cavetileRange = (c1, r1, c2, r2) => {
            // 创建 CavetileWall (带 cave 皮肤) — 共享 dedup Set
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                const key = c + ',' + r;
                if (_wallCells.has(key)) continue;
                _wallCells.add(key);
                new CavetileWall(this, c * G + G / 2, r * G + G / 2, G, G);
            }
        };
        const platformRange = (c1, r1, c2, r2) => {
            // 创建 PlatformBlock (单向平台, 上跳穿下落)
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                new PlatformBlock(this, c * G + G / 2, r * G + G / 2, G, G);
            }
        };
        const airBg = (c1, r1, c2, r2) => { airRange(c1, r1, c2, r2); bgRange(c1, r1, c2, r2); };

        // === SZ3 整体地形 0.5x 缩放 — 玩家通行 + 墙厚度都 ≤ 4 格半径 ===
        // 缩放前: 3945 walls, 12954 cavetiles, 242 airs
        // 缩放后: 1055 walls, 3802 cavetiles, 81 airs

        // --- AIR (显式 clear) ---
        airRange(-58, 110, -57, 110);
        airRange(-14, 6, -11, 6);
        airRange(-67, 41, -66, 41);
        airRange(-11, 7, 0, 9);
        airRange(-57, 109, -56, 109);
        airRange(-15, 8, -12, 8);
        airRange(-77, 31, -70, 31);
        airRange(-37, 35, -37, 37);
        airRange(-59, 42, -59, 43);
        airRange(-70, 32, -70, 32);
        airRange(-58, 43, -58, 43);
        airRange(-34, 34, -33, 34);
        airRange(-72, 34, -72, 34);
        airRange(-68, 42, -68, 43);
        airRange(-67, 42, -67, 42);
        airRange(-59, 111, -58, 111);
        airRange(-71, 33, -71, 33);
        airRange(-12, 9, -12, 9);
        airRange(-73, 35, -73, 35);
        airRange(-103, 64, -103, 64);
        airRange(-36, 35, -36, 35);
        airRange(-56, 108, -56, 108);
        airRange(-31, 36, -31, 36);
        airRange(-66, 44, -66, 44);

        // --- WALL (plain, 无 cavetile 皮肤) ---
        wallRange(-42, 50, -39, 50);
        wallRange(-74, 116, -67, 116);
        wallRange(-82, 79, -82, 79);
        wallRange(-58, 46, -58, 46);
        wallRange(-66, 64, -56, 64);
        wallRange(-47, 64, -46, 64);
        wallRange(-90, 93, -90, 93);
        wallRange(-6, 62, -6, 110);
        wallRange(-98, 89, -96, 89);
        wallRange(-41, 38, -34, 38);
        wallRange(-46, 105, -34, 105);
        wallRange(-66, 32, -58, 32);
        wallRange(-25, 70, -24, 70);
        wallRange(-16, 70, -14, 70);
        wallRange(-45, 114, -34, 114);
        wallRange(-98, 107, -98, 107);
        wallRange(-50, 110, -31, 110);
        wallRange(-63, 39, -60, 39);
        wallRange(-36, 75, -33, 75);
        wallRange(-58, 52, -43, 52);
        wallRange(-105, 67, -105, 73);
        wallRange(-69, 48, -60, 48);
        wallRange(-42, 26, -42, 26);
        wallRange(-24, 62, -7, 62);
        wallRange(-13, 71, -13, 73);
        wallRange(-81, 25, -70, 25);
        wallRange(-29, 62, -29, 63);
        wallRange(-21, 76, -19, 76);
        wallRange(-41, 111, -30, 111);
        wallRange(-72, 105, -64, 105);
        wallRange(-45, 108, -43, 109);
        wallRange(-64, 114, -64, 114);
        wallRange(-30, 81, -28, 81);
        wallRange(-43, 79, -40, 79);
        wallRange(-73, 110, -69, 110);
        wallRange(-75, 113, -75, 115);
        wallRange(-71, 84, -71, 84);
        wallRange(-66, 93, -60, 93);
        wallRange(-30, 103, -30, 104);
        wallRange(-37, 32, -31, 32);
        wallRange(-67, 63, -67, 63);
        wallRange(-32, 10, -13, 10);
        wallRange(-90, 70, -89, 70);
        wallRange(-83, 111, -78, 111);
        wallRange(-34, 96, -33, 96);
        wallRange(-32, 7, -14, 7);
        wallRange(-14, 74, -14, 74);
        wallRange(-85, 29, -85, 35);
        wallRange(-63, 34, -57, 34);
        wallRange(-49, 116, -47, 116);
        wallRange(-23, 78, -22, 79);
        wallRange(-45, 77, -45, 77);
        wallRange(-105, 106, -99, 106);
        wallRange(-60, 112, -57, 112);
        wallRange(-50, 51, -40, 51);
        wallRange(-33, 97, -33, 97);
        wallRange(-106, 85, -106, 85);
        wallRange(-87, 98, -87, 99);
        wallRange(-56, 113, -53, 113);
        wallRange(-44, 78, -44, 78);
        wallRange(-106, 90, -106, 96);
        wallRange(-88, 107, -86, 107);
        wallRange(-106, 102, -106, 105);
        wallRange(-71, 70, -71, 70);
        wallRange(-67, 40, -64, 40);
        wallRange(-96, 86, -91, 86);
        wallRange(-82, 49, -82, 51);
        wallRange(-83, 59, -82, 60);
        wallRange(-19, 98, -19, 98);
        wallRange(-30, 40, -28, 40);
        wallRange(-85, 69, -81, 69);
        wallRange(-26, 67, -26, 68);
        wallRange(-36, 44, -36, 45);
        wallRange(-38, 112, -34, 112);
        wallRange(-90, 71, -90, 74);
        wallRange(-47, 108, -46, 108);
        wallRange(-101, 83, -101, 83);
        wallRange(-57, 50, -49, 50);
        wallRange(-52, 84, -45, 84);
        wallRange(-68, 80, -68, 80);
        wallRange(-54, 24, -54, 24);
        wallRange(-7, 108, -7, 108);
        wallRange(-57, 89, -57, 89);
        wallRange(-25, 69, -25, 69);
        wallRange(-80, 68, -74, 68);
        wallRange(-107, 97, -107, 101);
        wallRange(-33, 83, -33, 83);
        wallRange(-106, 80, -106, 81);
        wallRange(-55, 104, -53, 104);
        wallRange(-42, 43, -39, 43);
        wallRange(-39, 8, -38, 8);
        wallRange(-22, 110, -7, 110);
        wallRange(-68, 35, -67, 35);
        wallRange(-50, 115, -50, 115);
        wallRange(-68, 44, -67, 44);
        wallRange(-19, 93, -17, 93);
        wallRange(-102, 60, -101, 60);
        wallRange(-78, 34, -78, 34);
        wallRange(-55, 45, -49, 45);
        wallRange(-88, 96, -88, 97);
        wallRange(-77, 35, -74, 35);
        wallRange(-64, 54, -64, 54);
        wallRange(-76, 89, -76, 89);
        wallRange(-75, 63, -75, 63);
        wallRange(-44, 41, -44, 42);
        wallRange(-41, 36, -41, 37);
        wallRange(-95, 66, -95, 66);
        wallRange(-76, 107, -76, 107);
        wallRange(-41, 46, -40, 46);
        wallRange(-54, 46, -50, 46);
        wallRange(-72, 77, -72, 77);
        wallRange(-72, 86, -72, 86);
        wallRange(-34, 33, -32, 33);
        wallRange(-71, 50, -71, 54);
        wallRange(-59, 25, -55, 25);
        wallRange(-24, 109, -22, 109);
        wallRange(-81, 103, -81, 104);
        wallRange(-28, 30, -28, 30);
        wallRange(-36, 26, -35, 26);
        wallRange(-47, 26, -46, 26);
        wallRange(-38, 93, -38, 93);
        wallRange(-93, 90, -89, 90);
        wallRange(-20, 106, -16, 106);
        wallRange(-51, 74, -48, 74);
        wallRange(-28, 111, -23, 111);
        wallRange(-88, 43, -82, 43);
        wallRange(-44, 27, -44, 27);
        wallRange(-53, 58, -53, 60);
        wallRange(-53, 23, -51, 23);
        wallRange(-75, 56, -75, 59);
        wallRange(-83, 52, -83, 54);
        wallRange(-87, 65, -87, 65);
        wallRange(-29, 34, -29, 34);
        wallRange(-63, 41, -59, 41);
        wallRange(-79, 32, -79, 33);
        wallRange(-32, 28, -30, 28);
        wallRange(-32, 82, -31, 82);
        wallRange(-63, 113, -62, 113);
        wallRange(-81, 42, -78, 42);
        wallRange(-66, 115, -66, 115);
        wallRange(-31, 91, -31, 91);
        wallRange(-41, 42, -40, 42);
        wallRange(-51, 42, -45, 42);
        wallRange(-84, 103, -82, 103);
        wallRange(-85, 112, -84, 112);
        wallRange(-34, 49, -34, 50);
        wallRange(-49, 56, -49, 60);
        wallRange(-28, 62, -26, 62);
        wallRange(-80, 91, -80, 91);
        wallRange(-18, 75, -15, 75);
        wallRange(-88, 76, -88, 79);
        wallRange(-26, 80, -25, 80);
        wallRange(-57, 83, -55, 83);
        wallRange(-35, 59, -32, 59);
        wallRange(-107, 82, -107, 84);
        wallRange(-29, 29, -29, 29);
        wallRange(-87, 69, -87, 69);
        wallRange(-24, 72, -23, 72);
        wallRange(-72, 32, -71, 32);
        wallRange(-77, 110, -77, 110);
        wallRange(-85, 106, -83, 106);
        wallRange(-75, 106, -73, 106);
        wallRange(-93, 111, -92, 111);
        wallRange(-33, 104, -31, 104);
        wallRange(-84, 85, -80, 85);
        wallRange(-19, 69, -17, 69);
        wallRange(-81, 93, -81, 97);
        wallRange(-48, 61, -42, 61);
        wallRange(-103, 75, -103, 77);
        wallRange(-49, 64, -49, 64);
        wallRange(-76, 45, -76, 47);
        wallRange(-34, 27, -33, 27);
        wallRange(-58, 69, -56, 69);
        wallRange(-83, 26, -82, 26);
        wallRange(-76, 74, -75, 74);
        wallRange(-65, 74, -65, 74);
        wallRange(-65, 83, -65, 83);
        wallRange(-16, 88, -16, 92);
        wallRange(-55, 106, -55, 106);
        wallRange(-64, 22, -63, 22);
        wallRange(-12, 103, -12, 104);
        wallRange(-62, 85, -62, 85);
        wallRange(-52, 40, -52, 40);
        wallRange(-31, 37, -30, 38);
        wallRange(-27, 41, -27, 42);
        wallRange(-37, 10, -37, 25);
        wallRange(-42, 99, -40, 99);
        wallRange(-91, 56, -91, 57);
        wallRange(-40, 60, -37, 60);
        wallRange(-39, 34, -35, 34);
        wallRange(-103, 61, -102, 61);
        wallRange(-38, 78, -38, 78);
        wallRange(-63, 76, -61, 76);
        wallRange(-34, 39, -34, 40);
        wallRange(-69, 81, -69, 81);
        wallRange(-76, 50, -76, 51);
        wallRange(-83, 39, -80, 39);
        wallRange(-35, 85, -35, 88);
        wallRange(-84, 48, -83, 48);
        wallRange(-87, 113, -86, 113);
        wallRange(-66, 109, -66, 109);
        wallRange(-21, 94, -20, 94);
        wallRange(-73, 88, -73, 88);
        wallRange(-70, 49, -69, 49);
        wallRange(-17, 87, -17, 87);
        wallRange(-80, 55, -80, 58);
        wallRange(-88, 61, -88, 63);
        wallRange(-68, 41, -68, 41);
        wallRange(-53, 37, -53, 38);
        wallRange(-64, 38, -64, 38);
        wallRange(-90, 112, -88, 112);
        wallRange(-31, 44, -31, 44);
        wallRange(-87, 53, -87, 54);
        wallRange(-97, 108, -96, 108);
        wallRange(-66, 86, -66, 86);
        wallRange(-101, 59, -95, 59);
        wallRange(-104, 78, -104, 78);
        wallRange(-30, 35, -30, 36);
        wallRange(-92, 47, -92, 55);
        wallRange(-50, 66, -50, 67);
        wallRange(-63, 106, -62, 106);
        wallRange(-67, 23, -65, 23);
        wallRange(-48, 103, -48, 103);
        wallRange(-57, 45, -57, 45);
        wallRange(-47, 95, -47, 95);
        wallRange(-54, 56, -54, 56);
        wallRange(-47, 104, -47, 104);
        wallRange(-65, 33, -64, 33);
        wallRange(-97, 85, -97, 85);
        wallRange(-104, 64, -104, 66);
        wallRange(-42, 57, -41, 57);
        wallRange(-74, 60, -72, 60);
        wallRange(-93, 91, -93, 91);
        wallRange(-81, 65, -81, 65);
        wallRange(-65, 101, -63, 101);
        wallRange(-74, 78, -73, 78);
        wallRange(-100, 79, -100, 79);
        wallRange(-82, 105, -82, 105);
        wallRange(-89, 75, -89, 75);
        wallRange(-43, 42, -43, 42);
        wallRange(-87, 80, -85, 80);
        wallRange(-66, 58, -66, 58);
        wallRange(-66, 67, -66, 67);
        wallRange(-84, 28, -84, 28);
        wallRange(-13, 106, -13, 106);
        wallRange(-27, 31, -27, 31);
        wallRange(-32, 74, -32, 74);
        wallRange(-52, 105, -52, 105);
        wallRange(-39, 44, -39, 44);
        wallRange(-52, 114, -52, 114);
        wallRange(-67, 71, -67, 71);
        wallRange(-70, 65, -70, 65);
        wallRange(-55, 63, -55, 63);
        wallRange(-55, 90, -55, 90);
        wallRange(-25, 91, -25, 91);
        wallRange(-34, 113, -34, 113);
        wallRange(-85, 58, -85, 58);
        wallRange(-22, 105, -21, 105);
        wallRange(-77, 79, -77, 80);
        wallRange(-53, 99, -53, 99);
        wallRange(-96, 76, -95, 76);
        wallRange(-64, 108, -64, 108);
        wallRange(-83, 104, -83, 104);
        wallRange(-84, 59, -84, 59);
        wallRange(-81, 55, -81, 55);
        wallRange(-60, 87, -60, 87);
        wallRange(-29, 102, -29, 102);
        wallRange(-79, 83, -79, 83);
        wallRange(-51, 92, -51, 92);
        wallRange(-36, 53, -36, 53);
        wallRange(-89, 91, -89, 92);
        wallRange(-72, 99, -71, 99);
        wallRange(-32, 45, -32, 46);
        wallRange(-73, 117, -72, 117);
        wallRange(-59, 47, -59, 47);
        wallRange(-69, 24, -69, 24);
        wallRange(-48, 65, -48, 65);
        wallRange(-28, 43, -28, 43);
        wallRange(-56, 35, -55, 35);
        wallRange(-47, 48, -47, 48);
        wallRange(-86, 56, -86, 56);
        wallRange(-89, 69, -89, 69);
        wallRange(-54, 36, -54, 36);
        wallRange(-77, 43, -77, 43);
        wallRange(-22, 77, -22, 77);
        wallRange(-105, 79, -105, 79);
        wallRange(-50, 24, -50, 24);
        wallRange(-105, 88, -105, 88);
        wallRange(-28, 101, -26, 101);
        wallRange(-46, 115, -46, 115);
        wallRange(-26, 102, -26, 102);
        wallRange(-57, 105, -57, 105);
        wallRange(-64, 75, -64, 75);
        wallRange(-60, 54, -60, 54);
        wallRange(-51, 41, -51, 41);
        wallRange(-90, 58, -90, 58);
        wallRange(-30, 109, -30, 109);
        wallRange(-34, 84, -34, 84);
        wallRange(-89, 59, -89, 59);
        wallRange(-97, 55, -97, 55);
        wallRange(-68, 100, -68, 100);
        wallRange(-45, 65, -45, 65);
        wallRange(-44, 57, -44, 57);
        wallRange(-23, 89, -23, 89);
        wallRange(-71, 57, -71, 58);
        wallRange(-71, 76, -71, 76);
        wallRange(-95, 109, -95, 109);
        wallRange(-90, 44, -90, 44);
        wallRange(-37, 65, -37, 65);
        wallRange(-35, 7, -35, 7);
        wallRange(-57, 95, -57, 95);
        wallRange(-30, 72, -30, 72);
        wallRange(-36, 10, -36, 10);
        wallRange(-65, 68, -65, 68);
        wallRange(-33, 47, -33, 48);
        wallRange(-49, 94, -49, 94);
        wallRange(-16, 100, -16, 100);
        wallRange(-41, 25, -41, 25);
        wallRange(-53, 69, -53, 69);
        wallRange(-42, 84, -42, 84);
        wallRange(-95, 90, -95, 90);
        wallRange(-40, 35, -40, 35);
        wallRange(-59, 40, -59, 40);
        wallRange(-91, 69, -91, 69);
        wallRange(-80, 84, -80, 84);
        wallRange(-45, 32, -45, 32);
        wallRange(-72, 33, -72, 33);
        wallRange(-91, 45, -91, 46);
        wallRange(-38, 49, -38, 49);
        wallRange(-30, 61, -30, 62);
        wallRange(-20, 97, -20, 97);
        wallRange(-50, 93, -50, 93);
        wallRange(-68, 62, -68, 62);
        wallRange(-36, 94, -36, 94);
        wallRange(-72, 64, -72, 64);
        wallRange(-42, 65, -42, 65);
        wallRange(-30, 39, -30, 39);
        wallRange(-51, 101, -51, 101);
        wallRange(-103, 62, -103, 63);
        wallRange(-46, 76, -46, 76);
        wallRange(-37, 54, -37, 54);
        wallRange(-36, 98, -36, 98);
        wallRange(-45, 40, -45, 40);
        wallRange(-24, 90, -24, 90);
        wallRange(-60, 24, -60, 24);
        wallRange(-31, 60, -31, 60);
        wallRange(-74, 89, -74, 89);
        wallRange(-81, 59, -81, 59);
        wallRange(-27, 66, -27, 66);
        wallRange(-68, 34, -68, 34);
        wallRange(-47, 75, -47, 75);
        wallRange(-58, 75, -58, 75);
        wallRange(-99, 64, -99, 64);
        wallRange(-83, 27, -83, 27);
        wallRange(-96, 74, -96, 75);
        wallRange(-21, 95, -21, 96);
        wallRange(-29, 92, -28, 92);
        wallRange(-85, 102, -85, 102);
        wallRange(-74, 111, -74, 111);
        wallRange(-28, 64, -28, 65);
        wallRange(-24, 71, -24, 71);
        wallRange(-42, 41, -42, 41);
        wallRange(-51, 68, -51, 68);
        wallRange(-89, 95, -89, 95);
        wallRange(-54, 62, -54, 62);
        wallRange(-93, 61, -93, 61);
        wallRange(-84, 57, -84, 57);
        wallRange(-100, 58, -100, 58);
        wallRange(-63, 107, -63, 107);
        wallRange(-79, 99, -79, 99);
        wallRange(-94, 110, -94, 110);
        wallRange(-58, 51, -58, 51);
        wallRange(-15, 101, -15, 101);
        wallRange(-78, 81, -78, 81);
        wallRange(-97, 77, -97, 77);
        wallRange(-78, 90, -78, 90);
        wallRange(-14, 102, -14, 102);
        wallRange(-45, 96, -45, 96);
        wallRange(-73, 34, -73, 34);
        wallRange(-104, 74, -104, 74);
        wallRange(-44, 97, -44, 97);
        wallRange(-28, 32, -28, 32);

        // --- CAVETILE WALL (带 cave 皮肤) ---
        cavetileRange(-52, 33, -42, 37);
        cavetileRange(-111, 73, -109, 109);
        cavetileRange(-35, 9, -33, 23);
        cavetileRange(-95, 75, -90, 75);
        cavetileRange(-98, 67, -92, 71);
        cavetileRange(-87, 19, -45, 20);
        cavetileRange(-90, 118, -30, 118);
        cavetileRange(-80, 95, -58, 98);
        cavetileRange(-65, 70, -31, 73);
        cavetileRange(-54, 32, -53, 34);
        cavetileRange(-110, 57, -106, 65);
        cavetileRange(-94, 76, -89, 85);
        cavetileRange(-42, 4, -40, 8);
        cavetileRange(-97, 72, -92, 73);
        cavetileRange(-88, 81, -79, 82);
        cavetileRange(-67, 59, -54, 61);
        cavetileRange(-95, 40, -90, 42);
        cavetileRange(-75, 55, -71, 55);
        cavetileRange(-24, 67, -10, 67);
        cavetileRange(-94, 66, -69, 66);
        cavetileRange(-95, 43, -92, 43);
        cavetileRange(-108, 108, -100, 111);
        cavetileRange(-63, 74, -59, 75);
        cavetileRange(-40, 57, -25, 57);
        cavetileRange(-58, 88, -41, 88);
        cavetileRange(-84, 56, -81, 56);
        cavetileRange(-20, 77, -14, 77);
        cavetileRange(-42, 107, -19, 108);
        cavetileRange(-61, 85, -42, 86);
        cavetileRange(-48, 50, -43, 50);
        cavetileRange(-64, 115, -52, 117);
        cavetileRange(-110, 110, -109, 110);
        cavetileRange(-48, 58, -36, 59);
        cavetileRange(-56, 89, -41, 89);
        cavetileRange(-44, 20, -41, 24);
        cavetileRange(-98, 78, -95, 84);
        cavetileRange(-28, 33, -24, 38);
        cavetileRange(-88, 21, -71, 23);
        cavetileRange(-29, 109, -25, 110);
        cavetileRange(-78, 32, -73, 32);
        cavetileRange(-108, 75, -105, 76);
        cavetileRange(-76, 108, -65, 108);
        cavetileRange(-66, 117, -65, 117);
        cavetileRange(-46, 95, -36, 95);
        cavetileRange(-88, 24, -84, 24);
        cavetileRange(-46, 60, -41, 60);
        cavetileRange(-96, 55, -93, 58);
        cavetileRange(-41, 65, -38, 69);
        cavetileRange(-98, 92, -91, 97);
        cavetileRange(-24, 80, -19, 80);
        cavetileRange(-76, 109, -67, 109);
        cavetileRange(-92, 105, -83, 105);
        cavetileRange(-32, 113, -30, 117);
        cavetileRange(-79, 75, -72, 76);
        cavetileRange(-14, 87, -9, 101);
        cavetileRange(-109, 56, -97, 56);
        cavetileRange(-96, 100, -87, 100);
        cavetileRange(-92, 64, -88, 65);
        cavetileRange(-76, 40, -69, 44);
        cavetileRange(-79, 39, -76, 39);
        cavetileRange(-88, 25, -86, 41);
        cavetileRange(-98, 114, -76, 115);
        cavetileRange(-19, 95, -15, 97);
        cavetileRange(-73, 89, -66, 92);
        cavetileRange(-57, 98, -54, 103);
        cavetileRange(-66, 62, -56, 63);
        cavetileRange(-85, 40, -77, 40);
        cavetileRange(-105, 57, -103, 58);
        cavetileRange(-80, 94, -59, 94);
        cavetileRange(-85, 36, -85, 39);
        cavetileRange(-75, 45, -58, 45);
        cavetileRange(-74, 56, -71, 56);
        cavetileRange(-52, 69, -42, 69);
        cavetileRange(-32, 47, -28, 47);
        cavetileRange(-43, 74, -39, 78);
        cavetileRange(-50, 39, -45, 39);
        cavetileRange(-87, 119, -31, 119);
        cavetileRange(-67, 62, -67, 62);
        cavetileRange(-27, 63, -25, 63);
        cavetileRange(-80, 92, -74, 93);
        cavetileRange(-51, 40, -46, 40);
        cavetileRange(-26, 64, -25, 64);
        cavetileRange(-23, 68, -20, 69);
        cavetileRange(-75, 107, -64, 107);
        cavetileRange(-73, 68, -66, 68);
        cavetileRange(-101, 112, -99, 114);
        cavetileRange(-34, 24, -24, 24);
        cavetileRange(-95, 44, -94, 52);
        cavetileRange(-44, 96, -35, 96);
        cavetileRange(-50, 92, -40, 92);
        cavetileRange(-72, 69, -59, 69);
        cavetileRange(-80, 65, -71, 65);
        cavetileRange(-20, 78, -17, 79);
        cavetileRange(-62, 82, -59, 84);
        cavetileRange(-34, 106, -22, 106);
        cavetileRange(-37, 67, -33, 69);
        cavetileRange(-25, 41, -24, 44);
        cavetileRange(-17, 85, -15, 86);
        cavetileRange(-95, 101, -86, 101);
        cavetileRange(-85, 25, -85, 26);
        cavetileRange(-99, 91, -94, 91);
        cavetileRange(-108, 87, -107, 89);
        cavetileRange(-44, 32, -38, 32);
        cavetileRange(-75, 46, -59, 46);
        cavetileRange(-65, 55, -58, 58);
        cavetileRange(-75, 120, -64, 120);
        cavetileRange(-41, 33, -40, 33);
        cavetileRange(-42, 109, -31, 109);
        cavetileRange(-51, 105, -47, 105);
        cavetileRange(-91, 67, -67, 67);
        cavetileRange(-31, 83, -26, 83);
        cavetileRange(-37, 39, -37, 46);
        cavetileRange(-61, 21, -45, 21);
        cavetileRange(-46, 74, -44, 75);
        cavetileRange(-93, 117, -75, 117);
        cavetileRange(-39, 4, -31, 4);
        cavetileRange(-100, 65, -99, 68);
        cavetileRange(-33, 50, -30, 56);
        cavetileRange(-75, 47, -72, 54);
        cavetileRange(-86, 49, -83, 50);
        cavetileRange(-44, 40, -38, 40);
        cavetileRange(-74, 57, -72, 59);
        cavetileRange(-19, 109, -8, 109);
        cavetileRange(-95, 74, -91, 74);
        cavetileRange(-11, 68, -9, 74);
        cavetileRange(-38, 56, -34, 56);
        cavetileRange(-26, 30, -24, 32);
        cavetileRange(-110, 66, -107, 72);
        cavetileRange(-29, 105, -23, 105);
        cavetileRange(-101, 80, -99, 82);
        cavetileRange(-14, 86, -10, 86);
        cavetileRange(-108, 77, -106, 77);
        cavetileRange(-43, 97, -37, 98);
        cavetileRange(-71, 36, -67, 38);
        cavetileRange(-76, 110, -74, 110);
        cavetileRange(-97, 98, -89, 99);
        cavetileRange(-47, 65, -46, 68);
        cavetileRange(-27, 43, -26, 46);
        cavetileRange(-91, 68, -81, 68);
        cavetileRange(-24, 88, -20, 88);
        cavetileRange(-32, 48, -30, 49);
        cavetileRange(-41, 34, -41, 35);
        cavetileRange(-17, 108, -8, 108);
        cavetileRange(-33, 85, -30, 90);
        cavetileRange(-39, 45, -38, 48);
        cavetileRange(-88, 83, -81, 84);
        cavetileRange(-41, 120, -32, 120);
        cavetileRange(-57, 32, -55, 32);
        cavetileRange(-35, 52, -34, 55);
        cavetileRange(-56, 33, -55, 33);
        cavetileRange(-25, 65, -24, 66);
        cavetileRange(-18, 76, -12, 76);
        cavetileRange(-42, 9, -41, 19);
        cavetileRange(-62, 114, -55, 114);
        cavetileRange(-23, 66, -23, 66);
        cavetileRange(-27, 32, -27, 32);
        cavetileRange(-70, 35, -69, 35);
        cavetileRange(-48, 94, -37, 94);
        cavetileRange(-39, 99, -39, 99);
        cavetileRange(-77, 33, -75, 33);
        cavetileRange(-108, 85, -108, 86);
        cavetileRange(-44, 65, -43, 68);
        cavetileRange(-73, 38, -72, 39);
        cavetileRange(-94, 103, -85, 103);
        cavetileRange(-81, 77, -73, 77);
        cavetileRange(-42, 66, -42, 68);
        cavetileRange(-52, 32, -46, 32);
        cavetileRange(-53, 100, -52, 103);
        cavetileRange(-59, 22, -55, 22);
        cavetileRange(-51, 102, -50, 104);
        cavetileRange(-34, 7, -33, 7);
        cavetileRange(-53, 107, -43, 107);
        cavetileRange(-72, 87, -66, 88);
        cavetileRange(-13, 68, -12, 70);
        cavetileRange(-14, 75, -10, 75);
        cavetileRange(-96, 116, -76, 116);
        cavetileRange(-46, 117, -33, 117);
        cavetileRange(-77, 90, -74, 91);
        cavetileRange(-47, 49, -39, 49);
        cavetileRange(-104, 112, -102, 113);
        cavetileRange(-66, 70, -66, 71);
        cavetileRange(-95, 54, -93, 54);
        cavetileRange(-48, 22, -45, 23);
        cavetileRange(-32, 69, -31, 69);
        cavetileRange(-32, 9, -13, 9);
        cavetileRange(-70, 83, -66, 85);
        cavetileRange(-57, 57, -54, 58);
        cavetileRange(-29, 88, -29, 91);
        cavetileRange(-52, 104, -52, 104);
        cavetileRange(-67, 99, -58, 100);
        cavetileRange(-16, 107, -13, 107);
        cavetileRange(-99, 109, -98, 111);
        cavetileRange(-93, 44, -93, 47);
        cavetileRange(-79, 64, -73, 64);
        cavetileRange(-54, 90, -41, 90);
        cavetileRange(-84, 58, -82, 58);
        cavetileRange(-51, 91, -41, 91);
        cavetileRange(-59, 87, -42, 87);
        cavetileRange(-66, 38, -65, 38);
        cavetileRange(-27, 81, -21, 81);
        cavetileRange(-48, 64, -48, 64);
        cavetileRange(-101, 58, -101, 58);
        cavetileRange(-95, 102, -87, 102);
        cavetileRange(-79, 41, -77, 41);
        cavetileRange(-49, 104, -48, 104);
        cavetileRange(-105, 59, -105, 61);
        cavetileRange(-73, 93, -67, 93);
        cavetileRange(-49, 41, -48, 41);
        cavetileRange(-51, 117, -49, 117);
        cavetileRange(-70, 21, -70, 22);
        cavetileRange(-36, 97, -34, 97);
        cavetileRange(-22, 70, -22, 71);
        cavetileRange(-64, 74, -64, 74);
        cavetileRange(-24, 110, -23, 110);
        cavetileRange(-60, 44, -58, 44);
        cavetileRange(-40, 21, -40, 22);
        cavetileRange(-38, 74, -33, 74);
        cavetileRange(-16, 87, -15, 87);
        cavetileRange(-68, 81, -67, 82);
        cavetileRange(-81, 78, -75, 78);
        cavetileRange(-31, 45, -28, 46);
        cavetileRange(-71, 47, -71, 48);
        cavetileRange(-32, 84, -28, 84);
        cavetileRange(-10, 104, -8, 107);
        cavetileRange(-28, 89, -25, 90);
        cavetileRange(-34, 51, -34, 51);
        cavetileRange(-52, 38, -46, 38);
        cavetileRange(-78, 99, -73, 99);
        cavetileRange(-46, 47, -40, 48);
        cavetileRange(-100, 83, -99, 83);
        cavetileRange(-70, 70, -67, 70);
        cavetileRange(-13, 7, -12, 7);
        cavetileRange(-108, 78, -107, 79);
        cavetileRange(-17, 94, -15, 94);
        cavetileRange(-50, 106, -45, 106);
        cavetileRange(-84, 113, -76, 113);
        cavetileRange(-44, 116, -33, 116);
        cavetileRange(-85, 41, -82, 41);
        cavetileRange(-35, 58, -33, 58);
        cavetileRange(-48, 57, -45, 57);
        cavetileRange(-63, 54, -61, 54);
        cavetileRange(-51, 109, -47, 109);
        cavetileRange(-47, 74, -47, 74);
        cavetileRange(-44, 84, -43, 84);
        cavetileRange(-44, 120, -44, 120);
        cavetileRange(-78, 63, -76, 63);
        cavetileRange(-66, 37, -66, 37);
        cavetileRange(-43, 57, -43, 57);
        cavetileRange(-92, 56, -92, 63);
        cavetileRange(-46, 24, -45, 24);
        cavetileRange(-36, 37, -36, 37);
        cavetileRange(-71, 86, -67, 86);
        cavetileRange(-49, 103, -49, 103);
        cavetileRange(-84, 38, -84, 39);
        cavetileRange(-11, 107, -11, 107);
        cavetileRange(-60, 101, -58, 102);
        cavetileRange(-106, 112, -105, 112);
        cavetileRange(-92, 91, -90, 91);
        cavetileRange(-49, 93, -39, 93);
        cavetileRange(-77, 111, -75, 112);
        cavetileRange(-30, 44, -28, 44);
        cavetileRange(-81, 79, -78, 80);
        cavetileRange(-49, 66, -48, 68);
        cavetileRange(-36, 39, -35, 42);
        cavetileRange(-90, 69, -90, 69);
        cavetileRange(-98, 65, -97, 66);
        cavetileRange(-70, 47, -69, 47);
        cavetileRange(-34, 86, -34, 87);
        cavetileRange(-16, 98, -15, 99);
        cavetileRange(-45, 76, -44, 76);
        cavetileRange(-87, 51, -85, 52);
        cavetileRange(-94, 53, -94, 53);
        cavetileRange(-91, 58, -91, 63);
        cavetileRange(-69, 82, -69, 82);
        cavetileRange(-90, 59, -90, 63);
        cavetileRange(-57, 56, -55, 56);
        cavetileRange(-25, 45, -25, 45);
        cavetileRange(-24, 89, -24, 89);
        cavetileRange(-45, 66, -45, 68);
        cavetileRange(-84, 80, -82, 80);
        cavetileRange(-68, 60, -68, 61);
        cavetileRange(-48, 56, -46, 56);
        cavetileRange(-93, 104, -86, 104);
        cavetileRange(-66, 82, -66, 82);
        cavetileRange(-57, 23, -57, 23);
        cavetileRange(-80, 76, -80, 76);
        cavetileRange(-52, 108, -48, 108);
        cavetileRange(-56, 105, -55, 105);
        cavetileRange(-29, 58, -24, 60);
        cavetileRange(-51, 116, -51, 116);
        cavetileRange(-71, 39, -69, 39);
        cavetileRange(-104, 59, -104, 59);
        cavetileRange(-13, 102, -9, 102);
        cavetileRange(-21, 70, -21, 70);
        cavetileRange(-108, 107, -104, 107);
        cavetileRange(-88, 85, -85, 85);
        cavetileRange(-29, 25, -24, 26);
        cavetileRange(-55, 62, -55, 62);
        cavetileRange(-75, 89, -75, 89);
        cavetileRange(-29, 56, -28, 56);
        cavetileRange(-17, 66, -17, 66);
        cavetileRange(-79, 91, -78, 91);
        cavetileRange(-58, 84, -53, 84);
        cavetileRange(-62, 81, -60, 81);
        cavetileRange(-48, 55, -47, 55);
        cavetileRange(-28, 91, -26, 91);
        cavetileRange(-58, 104, -57, 104);
        cavetileRange(-96, 77, -95, 77);
        cavetileRange(-28, 104, -24, 104);
        cavetileRange(-16, 78, -15, 78);
        cavetileRange(-56, 51, -51, 51);
        cavetileRange(-100, 57, -97, 57);
        cavetileRange(-62, 101, -61, 101);
        cavetileRange(-98, 113, -92, 113);
        cavetileRange(-19, 68, -14, 68);
        cavetileRange(-86, 55, -82, 55);
        cavetileRange(-96, 85, -95, 85);
        cavetileRange(-29, 111, -29, 111);
        cavetileRange(-91, 106, -86, 106);
        cavetileRange(-29, 82, -23, 82);
        cavetileRange(-43, 39, -38, 39);
        cavetileRange(-22, 87, -19, 87);
        cavetileRange(-18, 98, -17, 98);
        cavetileRange(-76, 48, -76, 49);
        cavetileRange(-97, 110, -97, 112);
        cavetileRange(-57, 97, -55, 97);
        cavetileRange(-108, 90, -108, 96);
        cavetileRange(-54, 106, -52, 106);
        cavetileRange(-98, 112, -98, 112);
        cavetileRange(-83, 57, -81, 57);
        cavetileRange(-108, 80, -108, 81);
        cavetileRange(-99, 90, -97, 90);
        cavetileRange(-93, 59, -93, 60);
        cavetileRange(-15, 100, -15, 100);
        cavetileRange(-44, 38, -42, 38);
        cavetileRange(-96, 112, -95, 112);
        cavetileRange(-69, 21, -68, 21);
        cavetileRange(-27, 103, -25, 103);
        cavetileRange(-36, 54, -36, 55);
        cavetileRange(-26, 27, -24, 28);
        cavetileRange(-86, 53, -84, 53);
        cavetileRange(-29, 35, -29, 35);
        cavetileRange(-94, 90, -94, 90);
        cavetileRange(-29, 48, -29, 48);
        cavetileRange(-28, 61, -25, 61);
        cavetileRange(-87, 50, -87, 50);
        cavetileRange(-10, 103, -9, 103);
        cavetileRange(-38, 41, -38, 42);
        cavetileRange(-108, 103, -108, 106);
        cavetileRange(-84, 51, -84, 51);
        cavetileRange(-27, 27, -27, 27);
        cavetileRange(-90, 92, -90, 92);
        cavetileRange(-44, 77, -44, 77);
        cavetileRange(-18, 107, -18, 107);
        cavetileRange(-88, 20, -88, 20);
        cavetileRange(-30, 110, -30, 110);
        cavetileRange(-37, 66, -36, 66);
        cavetileRange(-89, 60, -89, 63);
        cavetileRange(-24, 39, -24, 40);
        cavetileRange(-74, 39, -74, 39);
        cavetileRange(-36, 43, -36, 43);
        cavetileRange(-19, 86, -18, 86);
        cavetileRange(-39, 5, -39, 5);
        cavetileRange(-15, 69, -14, 69);
        cavetileRange(-89, 40, -89, 41);
        cavetileRange(-70, 99, -68, 99);
        cavetileRange(-94, 59, -94, 59);
        cavetileRange(-38, 75, -38, 77);
        cavetileRange(-58, 103, -58, 103);
        cavetileRange(-99, 78, -99, 79);
        cavetileRange(-108, 74, -106, 74);
        cavetileRange(-96, 66, -96, 66);
        cavetileRange(-32, 23, -31, 23);
        cavetileRange(-21, 109, -21, 109);
        cavetileRange(-58, 83, -58, 83);
        cavetileRange(-74, 74, -73, 74);
        cavetileRange(-71, 85, -71, 85);
        cavetileRange(-25, 29, -24, 29);
        cavetileRange(-86, 54, -85, 54);
        cavetileRange(-82, 65, -82, 65);
        cavetileRange(-30, 112, -30, 112);
        cavetileRange(-90, 97, -90, 97);
        cavetileRange(-91, 73, -91, 73);
        cavetileRange(-43, 19, -43, 19);
        cavetileRange(-65, 116, -65, 116);
        cavetileRange(-49, 65, -49, 65);
        cavetileRange(-41, 41, -41, 41);
        cavetileRange(-96, 111, -96, 111);
        cavetileRange(-58, 74, -57, 74);
        cavetileRange(-108, 73, -107, 73);
        cavetileRange(-35, 98, -35, 98);
        cavetileRange(-26, 39, -25, 39);
        cavetileRange(-50, 68, -50, 68);
        cavetileRange(-102, 57, -102, 57);
        cavetileRange(-26, 42, -26, 42);
        cavetileRange(-32, 25, -30, 25);
        cavetileRange(-69, 34, -69, 34);
        cavetileRange(-85, 57, -85, 57);
        cavetileRange(-32, 68, -32, 68);
        cavetileRange(-37, 75, -37, 75);
        cavetileRange(-57, 96, -56, 96);
        cavetileRange(-86, 69, -86, 69);
        cavetileRange(-30, 91, -30, 91);
        cavetileRange(-25, 62, -25, 62);
        cavetileRange(-30, 58, -30, 58);
        cavetileRange(-37, 55, -37, 55);
        cavetileRange(-63, 38, -63, 38);
        cavetileRange(-80, 83, -80, 83);
        cavetileRange(-99, 69, -99, 69);
        cavetileRange(-12, 74, -12, 74);
        cavetileRange(-88, 69, -88, 69);
        // === level_1779911829192.json — 第7批 (212 air + 260 wall rects) ===
        airRange(-36, 37, -36, 39);
        airRange(-73, 116, -67, 116);
        airRange(-73, 44, -67, 46);
        airRange(-59, 44, -58, 46);
        airRange(-91, 75, -89, 78);
        airRange(-35, 9, -33, 14);
        airRange(-65, 55, -58, 55);
        airRange(-48, 55, -47, 55);
        airRange(-37, 54, -28, 55);
        airRange(-50, 64, -46, 65);
        airRange(-35, 29, -32, 29);
        airRange(-98, 89, -96, 89);
        airRange(-35, 38, -34, 39);
        airRange(-16, 68, -12, 70);
        airRange(-45, 114, -34, 114);
        airRange(-98, 107, -98, 107);
        airRange(-42, 8, -38, 8);
        airRange(-16, 79, -14, 79);
        airRange(-105, 61, -105, 68);
        airRange(-26, 88, -25, 88);
        airRange(-44, 26, -42, 26);
        airRange(-99, 90, -97, 91);
        airRange(-42, 35, -40, 35);
        airRange(-13, 71, -13, 71);
        airRange(-45, 65, -37, 65);
        airRange(-13, 80, -13, 80);
        airRange(-32, 9, -13, 10);
        airRange(-21, 76, -21, 76);
        airRange(-75, 113, -75, 114);
        airRange(-64, 114, -64, 114);
        airRange(-70, 47, -67, 48);
        airRange(-22, 86, -17, 86);
        airRange(-90, 79, -88, 79);
        airRange(-69, 81, -67, 81);
        airRange(-83, 111, -80, 111);
        airRange(-35, 41, -35, 42);
        airRange(-35, 7, -12, 7);
        airRange(-43, 38, -37, 38);
        airRange(-66, 45, -60, 45);
        airRange(-46, 47, -43, 47);
        airRange(-42, 9, -41, 14);
        airRange(-100, 106, -99, 106);
        airRange(-22, 87, -20, 88);
        airRange(-15, 101, -14, 101);
        airRange(-87, 98, -87, 99);
        airRange(-40, 39, -37, 39);
        airRange(-35, 52, -27, 53);
        airRange(-87, 113, -83, 114);
        airRange(-91, 73, -90, 74);
        airRange(-70, 40, -67, 40);
        airRange(-82, 51, -82, 51);
        airRange(-46, 66, -38, 66);
        airRange(-83, 60, -82, 60);
        airRange(-30, 40, -27, 40);
        airRange(-20, 106, -18, 107);
        airRange(-73, 43, -69, 43);
        airRange(-37, 44, -36, 45);
        airRange(-68, 80, -68, 80);
        airRange(-50, 91, -48, 93);
        airRange(-57, 89, -55, 89);
        airRange(-42, 4, -40, 7);
        airRange(-30, 35, -29, 35);
        airRange(-31, 44, -28, 44);
        airRange(-63, 51, -63, 51);
        airRange(-72, 47, -71, 47);
        airRange(-61, 56, -54, 56);
        airRange(-42, 43, -40, 43);
        airRange(-39, 4, -31, 4);
        airRange(-70, 35, -67, 36);
        airRange(-95, 90, -89, 90);
        airRange(-59, 57, -54, 57);
        airRange(-38, 31, -36, 31);
        airRange(-18, 67, -13, 67);
        airRange(-103, 60, -101, 60);
        airRange(-98, 65, -97, 65);
        airRange(-88, 96, -88, 97);
        airRange(-69, 110, -69, 110);
        airRange(-19, 85, -18, 85);
        airRange(-16, 88, -15, 90);
        airRange(-34, 51, -28, 51);
        airRange(-64, 54, -60, 54);
        airRange(-72, 59, -72, 60);
        airRange(-44, 41, -44, 42);
        airRange(-44, 36, -41, 37);
        airRange(-106, 62, -106, 66);
        airRange(-97, 66, -92, 66);
        airRange(-66, 46, -63, 46);
        airRange(-41, 46, -41, 46);
        airRange(-72, 42, -69, 42);
        airRange(-55, 90, -49, 90);
        airRange(-32, 33, -32, 33);
        airRange(-96, 67, -93, 67);
        airRange(-28, 30, -28, 30);
        airRange(-36, 26, -35, 26);
        airRange(-58, 88, -57, 88);
        airRange(-44, 27, -44, 27);
        airRange(-54, 58, -53, 58);
        airRange(-16, 107, -13, 107);
        airRange(-29, 34, -28, 34);
        airRange(-66, 115, -66, 115);
        airRange(-32, 28, -30, 28);
        airRange(-51, 42, -45, 42);
        airRange(-85, 112, -81, 112);
        airRange(-61, 86, -61, 86);
        airRange(-88, 76, -88, 78);
        airRange(-76, 35, -74, 35);
        airRange(-47, 48, -45, 48);
        airRange(-16, 84, -15, 84);
        airRange(-12, 81, -12, 83);
        airRange(-29, 29, -29, 29);
        airRange(-72, 32, -71, 32);
        airRange(-71, 41, -68, 41);
        airRange(-21, 69, -17, 69);
        airRange(-37, 30, -34, 30);
        airRange(-81, 103, -81, 103);
        airRange(-19, 87, -19, 87);
        airRange(-17, 106, -16, 106);
        airRange(-66, 47, -64, 47);
        airRange(-17, 66, -14, 66);
        airRange(-34, 27, -33, 27);
        airRange(-67, 83, -65, 83);
        airRange(-83, 52, -83, 53);
        airRange(-12, 103, -12, 104);
        airRange(-62, 83, -62, 85);
        airRange(-52, 40, -48, 40);
        airRange(-71, 36, -71, 36);
        airRange(-27, 41, -27, 43);
        airRange(-37, 10, -37, 25);
        airRange(-47, 56, -46, 56);
        airRange(-104, 61, -102, 61);
        airRange(-49, 41, -48, 41);
        airRange(-67, 82, -66, 82);
        airRange(-44, 67, -40, 67);
        airRange(-66, 109, -66, 109);
        airRange(-20, 68, -17, 68);
        airRange(-17, 87, -16, 87);
        airRange(-57, 50, -57, 50);
        airRange(-89, 112, -88, 112);
        airRange(-97, 108, -96, 108);
        airRange(-30, 36, -30, 36);
        airRange(-28, 32, -27, 33);
        airRange(-32, 45, -30, 45);
        airRange(-61, 48, -60, 48);
        airRange(-49, 94, -48, 94);
        airRange(-57, 45, -57, 45);
        airRange(-47, 95, -47, 95);
        airRange(-24, 87, -23, 87);
        airRange(-104, 62, -104, 66);
        airRange(-44, 57, -41, 57);
        airRange(-14, 102, -13, 102);
        airRange(-74, 60, -73, 60);
        airRange(-92, 63, -92, 65);
        airRange(-27, 54, -27, 54);
        airRange(-100, 79, -99, 79);
        airRange(-43, 42, -43, 42);
        airRange(-88, 80, -86, 80);
        airRange(-13, 106, -13, 106);
        airRange(-27, 31, -27, 31);
        airRange(-69, 34, -68, 34);
        airRange(-98, 92, -98, 92);
        airRange(-17, 108, -15, 108);
        airRange(-34, 113, -34, 113);
        airRange(-85, 58, -85, 58);
        airRange(-31, 37, -31, 38);
        airRange(-22, 105, -21, 105);
        airRange(-21, 70, -21, 70);
        airRange(-84, 59, -84, 59);
        airRange(-60, 87, -59, 87);
        airRange(-51, 91, -51, 92);
        airRange(-36, 53, -36, 53);
        airRange(-99, 78, -98, 78);
        airRange(-59, 47, -59, 47);
        airRange(-28, 43, -28, 43);
        airRange(-22, 77, -22, 77);
        airRange(-62, 50, -62, 50);
        airRange(-36, 43, -36, 43);
        airRange(-90, 72, -90, 72);
        airRange(-101, 80, -101, 81);
        airRange(-46, 115, -46, 115);
        airRange(-51, 41, -51, 41);
        airRange(-88, 113, -88, 113);
        airRange(-71, 58, -71, 58);
        airRange(-95, 109, -95, 109);
        airRange(-22, 71, -22, 71);
        airRange(-60, 44, -60, 44);
        airRange(-40, 21, -40, 22);
        airRange(-39, 5, -39, 5);
        airRange(-36, 10, -36, 10);
        airRange(-16, 91, -16, 91);
        airRange(-16, 100, -16, 100);
        airRange(-41, 25, -41, 25);
        airRange(-60, 39, -60, 39);
        airRange(-59, 40, -59, 40);
        airRange(-37, 46, -37, 46);
        airRange(-72, 33, -72, 33);
        airRange(-75, 59, -75, 59);
        airRange(-23, 78, -23, 78);
        airRange(-30, 39, -30, 39);
        airRange(-103, 62, -103, 63);
        airRange(-34, 40, -34, 41);
        airRange(-82, 113, -82, 113);
        airRange(-107, 64, -107, 65);
        airRange(-66, 84, -66, 84);
        airRange(-63, 113, -63, 113);
        airRange(-99, 64, -99, 64);
        airRange(-89, 91, -89, 91);
        airRange(-31, 32, -31, 32);
        airRange(-89, 95, -89, 95);
        airRange(-58, 51, -58, 51);
        airRange(-35, 34, -35, 34);
        airRange(-97, 77, -97, 77);
        airRange(-73, 34, -73, 34);
        wallRange(-29, 49, -23, 50);
        wallRange(-80, 112, -78, 112);
        wallRange(-70, 49, -69, 53);
        wallRange(-32, 20, -23, 22);
        wallRange(-63, 120, -45, 120);
        wallRange(-8, 63, -7, 103);
        wallRange(-45, 15, -42, 17);
        wallRange(-82, 106, -82, 106);
        wallRange(-48, 25, -42, 25);
        wallRange(-97, 38, -96, 54);
        wallRange(-67, 21, -62, 21);
        wallRange(-7, 109, -7, 109);
        wallRange(-27, 47, -23, 48);
        wallRange(-85, 27, -85, 28);
        wallRange(-54, 43, -51, 44);
        wallRange(-27, 55, -23, 56);
        wallRange(-68, 49, -63, 50);
        wallRange(-55, 52, -49, 52);
        wallRange(-71, 117, -67, 117);
        wallRange(-66, 48, -62, 48);
        wallRange(-105, 77, -104, 77);
        wallRange(-33, 84, -33, 84);
        wallRange(-33, 15, -31, 17);
        wallRange(-54, 22, -49, 22);
        wallRange(-107, 86, -105, 86);
        wallRange(-93, 48, -93, 53);
        wallRange(-23, 23, -23, 46);
        wallRange(-104, 60, -104, 60);
        wallRange(-55, 96, -52, 96);
        wallRange(-22, 111, -6, 112);
        wallRange(-73, 38, -72, 38);
        wallRange(-11, 76, -9, 85);
        wallRange(-54, 105, -53, 105);
        wallRange(-54, 114, -53, 114);
        wallRange(-97, 117, -94, 117);
        wallRange(-43, 120, -42, 120);
        wallRange(-31, 120, -30, 120);
        wallRange(-54, 97, -52, 97);
        wallRange(-24, 63, -9, 64);
        wallRange(-64, 23, -58, 23);
        wallRange(-44, 106, -35, 106);
        wallRange(-40, 40, -36, 41);
        wallRange(-79, 34, -77, 35);
        wallRange(-102, 114, -102, 114);
        wallRange(-35, 15, -34, 16);
        wallRange(-28, 63, -28, 63);
        wallRange(-15, 91, -15, 93);
        wallRange(-80, 120, -76, 120);
        wallRange(-39, 33, -33, 33);
        wallRange(-7, 104, -7, 107);
        wallRange(-23, 65, -9, 65);
        wallRange(-99, 58, -97, 58);
        wallRange(-58, 94, -55, 94);
        wallRange(-100, 115, -99, 115);
        wallRange(-13, 66, -9, 66);
        wallRange(-56, 95, -53, 95);
        wallRange(-83, 24, -70, 24);
        wallRange(-65, 90, -64, 92);
        wallRange(-56, 104, -56, 104);
        wallRange(-95, 38, -89, 39);
        wallRange(-89, 42, -82, 42);
        wallRange(-63, 92, -63, 92);
        wallRange(-50, 44, -48, 44);
        wallRange(-56, 23, -54, 23);
        wallRange(-80, 30, -72, 31);
        wallRange(-29, 112, -23, 112);
        wallRange(-72, 106, -64, 106);
        wallRange(-101, 83, -101, 83);
        wallRange(-16, 85, -13, 86);
        wallRange(-27, 51, -23, 51);
        wallRange(-69, 22, -65, 22);
        wallRange(-66, 40, -60, 40);
        wallRange(-14, 78, -12, 78);
        wallRange(-15, 87, -14, 87);
        wallRange(-63, 41, -61, 42);
        wallRange(-107, 106, -106, 106);
        wallRange(-22, 66, -18, 66);
        wallRange(-106, 89, -105, 89);
        wallRange(-81, 32, -80, 33);
        wallRange(-40, 34, -36, 34);
        wallRange(-103, 59, -102, 59);
        wallRange(-91, 43, -89, 43);
        wallRange(-25, 46, -24, 46);
        wallRange(-19, 94, -18, 94);
        wallRange(-30, 23, -24, 23);
        wallRange(-65, 89, -65, 89);
        wallRange(-107, 90, -107, 96);
        wallRange(-20, 95, -20, 96);
        wallRange(-33, 105, -30, 105);
        wallRange(-91, 70, -91, 72);
        wallRange(-86, 108, -84, 108);
        wallRange(-68, 39, -64, 39);
        wallRange(-82, 104, -81, 104);
        wallRange(-28, 102, -27, 102);
        wallRange(-46, 116, -45, 116);
        wallRange(-56, 44, -55, 44);
        wallRange(-58, 53, -54, 53);
        wallRange(-45, 18, -43, 18);
        wallRange(-25, 68, -24, 68);
        wallRange(-107, 102, -107, 105);
        wallRange(-106, 67, -106, 73);
        wallRange(-71, 37, -71, 37);
        wallRange(-32, 18, -31, 19);
        wallRange(-106, 78, -106, 79);
        wallRange(-60, 46, -60, 46);
        wallRange(-106, 87, -106, 88);
        wallRange(-23, 104, -23, 104);
        wallRange(-102, 58, -102, 58);
        wallRange(-20, 109, -20, 109);
        wallRange(-26, 52, -23, 54);
        wallRange(-78, 33, -78, 33);
        wallRange(-61, 113, -57, 113);
        wallRange(-33, 30, -32, 32);
        wallRange(-103, 107, -99, 107);
        wallRange(-54, 35, -53, 35);
        wallRange(-34, 85, -34, 85);
        wallRange(-16, 93, -16, 93);
        wallRange(-29, 36, -29, 38);
        wallRange(-60, 41, -59, 41);
        wallRange(-11, 103, -11, 103);
        wallRange(-92, 44, -91, 44);
        wallRange(-59, 24, -55, 24);
        wallRange(-49, 24, -47, 24);
        wallRange(-30, 59, -30, 60);
        wallRange(-63, 33, -57, 33);
        wallRange(-27, 65, -26, 65);
        wallRange(-85, 107, -83, 107);
        wallRange(-94, 112, -91, 112);
        wallRange(-70, 23, -68, 23);
        wallRange(-68, 51, -64, 51);
        wallRange(-57, 51, -57, 51);
        wallRange(-26, 66, -26, 66);
        wallRange(-26, 40, -25, 40);
        wallRange(-56, 34, -55, 34);
        wallRange(-75, 39, -73, 39);
        wallRange(-13, 77, -12, 77);
        wallRange(-91, 113, -89, 113);
        wallRange(-23, 57, -23, 61);
        wallRange(-87, 64, -86, 64);
        wallRange(-42, 39, -41, 40);
        wallRange(-96, 110, -95, 110);
        wallRange(-33, 112, -31, 112);
        wallRange(-111, 56, -111, 72);
        wallRange(-45, 38, -44, 38);
        wallRange(-76, 34, -75, 34);
        wallRange(-12, 71, -12, 73);
        wallRange(-99, 85, -98, 85);
        wallRange(-107, 80, -107, 81);
        wallRange(-62, 22, -60, 22);
        wallRange(-32, 58, -31, 58);
        wallRange(-23, 70, -23, 71);
        wallRange(-77, 109, -77, 109);
        wallRange(-27, 64, -27, 64);
        wallRange(-26, 29, -26, 29);
        wallRange(-24, 57, -24, 57);
        wallRange(-48, 117, -47, 117);
        wallRange(-99, 116, -97, 116);
        wallRange(-84, 25, -82, 25);
        wallRange(-108, 97, -108, 102);
        wallRange(-12, 84, -12, 85);
        wallRange(-105, 104, -105, 105);
        wallRange(-86, 65, -83, 65);
        wallRange(-97, 109, -96, 109);
        wallRange(-104, 105, -104, 105);
        wallRange(-9, 86, -9, 86);
        wallRange(-100, 84, -99, 84);
        wallRange(-53, 98, -51, 98);
        wallRange(-65, 41, -64, 41);
        wallRange(-57, 54, -56, 54);
        wallRange(-24, 69, -24, 69);
        wallRange(-31, 30, -31, 31);
        wallRange(-83, 38, -83, 38);
        wallRange(-14, 84, -13, 84);
        wallRange(-85, 104, -84, 104);
        wallRange(-29, 103, -28, 103);
        wallRange(-91, 118, -91, 118);
        wallRange(-63, 47, -61, 47);
        wallRange(-89, 93, -89, 93);
        wallRange(-13, 79, -12, 79);
        wallRange(-84, 37, -84, 37);
        wallRange(-9, 67, -9, 67);
        wallRange(-80, 34, -80, 34);
        wallRange(-32, 83, -32, 83);
        wallRange(-63, 114, -63, 114);
        wallRange(-51, 106, -51, 106);
        wallRange(-108, 82, -108, 84);
        wallRange(-13, 74, -13, 74);
        wallRange(-86, 102, -86, 102);
        wallRange(-21, 77, -21, 79);
        wallRange(-92, 45, -92, 46);
        wallRange(-95, 111, -94, 111);
        wallRange(-28, 39, -27, 39);
        wallRange(-17, 85, -17, 85);
        wallRange(-28, 48, -28, 48);
        wallRange(-24, 45, -24, 45);
        wallRange(-84, 26, -84, 27);
        wallRange(-29, 61, -29, 61);
        wallRange(-104, 75, -104, 76);
        wallRange(-81, 41, -80, 41);
        wallRange(-9, 75, -9, 75);
        wallRange(-68, 52, -67, 52);
        wallRange(-30, 119, -30, 119);
        wallRange(-35, 31, -34, 31);
        wallRange(-35, 40, -35, 40);
        wallRange(-65, 115, -65, 115);
        wallRange(-83, 103, -82, 103);
        wallRange(-75, 116, -75, 116);
        wallRange(-52, 99, -51, 99);
        wallRange(-48, 60, -47, 60);
        wallRange(-58, 52, -58, 52);
        wallRange(-34, 88, -34, 89);
        wallRange(-25, 67, -25, 67);
        wallRange(-105, 74, -105, 74);
        wallRange(-99, 108, -98, 108);
        wallRange(-81, 31, -81, 31);
        wallRange(-30, 82, -30, 82);
        wallRange(-39, 42, -39, 42);
        wallRange(-70, 54, -70, 54);
        wallRange(-33, 49, -33, 49);
        wallRange(-44, 39, -43, 39);
        wallRange(-71, 48, -71, 49);
        wallRange(-14, 88, -14, 88);
        wallRange(-107, 85, -107, 85);
        wallRange(-74, 33, -74, 33);
        wallRange(-87, 63, -87, 63);
        wallRange(-94, 60, -94, 60);
        wallRange(-101, 57, -101, 57);
        wallRange(-46, 109, -46, 109);
        wallRange(-12, 80, -12, 80);
        wallRange(-110, 56, -110, 56);
        wallRange(-50, 116, -50, 116);
        wallRange(-56, 50, -56, 50);
        wallRange(-83, 51, -83, 51);
        wallRange(-74, 117, -74, 117);
        wallRange(-81, 105, -81, 105);
        wallRange(-26, 41, -26, 41);
        wallRange(-51, 115, -51, 115);
        wallRange(-44, 19, -44, 19);
        wallRange(-41, 15, -41, 15);
        wallRange(-95, 53, -95, 53);
        wallRange(-66, 116, -66, 116);
        wallRange(-38, 43, -38, 44);
        wallRange(-53, 36, -53, 36);
        wallRange(-78, 110, -78, 110);
        wallRange(-84, 54, -84, 54);
        wallRange(-45, 26, -45, 26);
        wallRange(-51, 100, -51, 100);
        wallRange(-31, 59, -31, 59);
        wallRange(-81, 58, -81, 58);
        wallRange(-88, 19, -88, 19);
        wallRange(-90, 94, -90, 94);
        wallRange(-77, 42, -77, 42);
        wallRange(-62, 49, -62, 49);
        wallRange(-105, 78, -105, 78);
        wallRange(-85, 56, -85, 56);
        wallRange(-50, 23, -49, 23);
        wallRange(-105, 87, -105, 87);
        wallRange(-24, 61, -24, 61);
        wallRange(-84, 52, -84, 52);
        wallRange(-29, 104, -29, 104);

        // === level_1780235534363.json — 第 8 批 (walls + platforms + 2 keydoors) ===

        // --- walls (16 cells, 7 rects) ---
        wallRange(-72, 32, -72, 32);
        wallRange(-70, 36, -69, 36);
        wallRange(-88, 52, -88, 53);
        wallRange(-36, 60, -32, 60);
        wallRange(-41, 61, -31, 61);
        wallRange(-38, 62, -34, 62);
        wallRange(-35, 66, -35, 66);

        // --- platforms (12 cells, 3 rects) ---
        platformRange(-84, 32, -82, 32);
        platformRange(-71, 32, -67, 32);
        // platformRange(-30, 30, -27, 30); — 删除: level_1780300640229.json 把这4格 platform→wall

        // --- KeyDoor 1: col -36, rows 63-65 (3 cells 垂直门) ---
        // --- KeyDoor 2: col -37, rows 113-115 (3 cells 垂直门) ---
        if (typeof KeyDoor !== 'undefined') {
            airRange(-36, 63, -36, 65);  // 确保门位是 air
            this._keyDoor = new KeyDoor(
                this,
                -36 * G + G / 2,
                (63 + 65 + 1) / 2 * G,  // center y of rows 63-65
                G,
                3 * G,
                { flipX: true }  // 镜像门贴图 (门框朝左, 开口对齐格子) — door 1 跟 door 2 朝向相反
            );
            airRange(-37, 113, -37, 115);
            this._keyDoor2 = new KeyDoor(
                this,
                -37 * G + G / 2,
                (113 + 115 + 1) / 2 * G,  // center y of rows 113-115
                G,
                3 * G,
                { flipX: true }  // door 2 也镜像 — 修正开门动画左右颠倒
            );
            // console.log('[SZ3] 2 KeyDoors created: (-36, 63-65) + (-37, 113-115)');   // (用户) 诊断日志静默
        }

        // === level_1780238706516.json — 60 个黄水晶 (Citrine 任务用) ===
        // ════════════════════════════════════════════════════════════
        // level_1780300640229.json 地形 (最后应用 = last-wins)
        // 49 wall (cols -33~-27, rows 25~36) — clear→cavetile, 落在黄土区(-88~-23,19~60)会自动变黄土皮
        // 2 air 还原, 1 y_crystal (加进下面 yCells)
        // ════════════════════════════════════════════════════════════
        const _json229Walls = [
            [-33,25],[-32,26],[-32,27],[-32,28],[-32,29],[-32,33],[-32,34],
            [-31,26],[-31,27],[-31,28],[-31,29],[-31,32],[-31,33],[-31,34],[-31,35],
            [-30,26],[-30,27],[-30,28],[-30,29],[-30,30],[-30,31],[-30,32],[-30,33],[-30,34],[-30,35],[-30,36],
            [-29,27],[-29,28],[-29,29],[-29,30],[-29,31],[-29,32],[-29,33],[-29,34],[-29,35],
            [-28,27],[-28,28],[-28,29],[-28,30],[-28,31],[-28,32],[-28,33],[-28,34],
            [-27,28],[-27,29],[-27,30],[-27,31],[-27,32],[-27,33]
        ];
        _json229Walls.forEach(([c, r]) => airRange(c, r, c, r));       // 先清 (含原platform残留)
        _json229Walls.forEach(([c, r]) => cavetileRange(c, r, c, r));  // 重建为 cavetile → 统一黄土皮
        airRange(-35, 34, -35, 34);  // 还原 air
        airRange(-30, 38, -30, 38);  // 还原 air

        // ════════════════════════════════════════════════════════════
        // level_1780303147329.json 怪物 (100 只) — spawn 进已有怪物组
        // 组/碰撞器/玩家重叠已在 create 里建好, 新成员自动生效
        // ════════════════════════════════════════════════════════════
        const _spawnSZ3Monster = (type, col, row) => {
            const mx = col * G + G / 2, my = row * G + G / 2;
            let cls = null, grp = null;
            switch (type) {
                case 'spider':        cls = (typeof CrystalHunterSpider !== 'undefined') ? CrystalHunterSpider : null; grp = this.spiders; break;
                case 'bat':           cls = (typeof CrystalBat !== 'undefined') ? CrystalBat : null; grp = this.bats; break;
                case 'slime':         cls = (typeof CrystalSlime !== 'undefined') ? CrystalSlime : null; grp = this.slimes; break;
                case 'beetle':        cls = (typeof HardrockBeetle !== 'undefined') ? HardrockBeetle : null; grp = this.beetles; break;
                case 'earthworm':     cls = (typeof CrystalEarthworm !== 'undefined') ? CrystalEarthworm : null; grp = this.earthworms; break;
                case 'bungee_spider': cls = (typeof CrystalBungeeSpider !== 'undefined') ? CrystalBungeeSpider : null; grp = this.bungeeSpiders; break;
                case 'volatile':      cls = (typeof VolatileCrystal !== 'undefined') ? VolatileCrystal : null; grp = this.volatileCrystals; break;
            }
            if (!cls || !grp) return;
            const m = new cls(this, mx, my);
            grp.add(m);
            if (type === 'bat' && m.body) { m.body.setAllowGravity(false); m.body.setVelocity(0, 0); }
            if (this.uiCam) { try { this.uiCam.ignore(m); } catch(e) {} }
        };
        const _sz3Monsters = [
            ['bat',[-106,97]],['bat',[-105,61]],['bat',[-98,72]],['bat',[-98,86]],['bat',[-93,62]],['bat',[-93,105]],['bat',[-89,71]],['bat',[-81,86]],['bat',[-81,106]],['bat',[-71,100]],['bat',[-69,110]],['bat',[-63,77]],['bat',[-55,107]],['bat',[-53,90]],['bat',[-51,75]],['bat',[-37,99]],['bat',[-26,92]],['bat',[-22,82]],['bat',[-17,99]],['bat',[-13,67]],
            ['beetle',[-100,106]],['beetle',[-96,67]],['beetle',[-73,116]],['beetle',[-68,104]],['beetle',[-57,111]],['beetle',[-55,93]],['beetle',[-53,83]],['beetle',[-45,104]],['beetle',[-20,107]],['beetle',[-17,92]],
            ['bungee_spider',[-99,70]],['bungee_spider',[-98,60]],['bungee_spider',[-94,87]],['bungee_spider',[-78,69]],['bungee_spider',[-76,79]],['bungee_spider',[-74,100]],['bungee_spider',[-62,107]],['bungee_spider',[-60,87]],['bungee_spider',[-48,75]],['bungee_spider',[-46,96]],['bungee_spider',[-35,89]],['bungee_spider',[-21,97]],['bungee_spider',[-18,67]],['bungee_spider',[-17,86]],
            ['earthworm',[-107,65]],['earthworm',[-106,84]],['earthworm',[-97,66]],['earthworm',[-95,90]],['earthworm',[-95,109]],['earthworm',[-75,73]],['earthworm',[-75,88]],['earthworm',[-75,105]],['earthworm',[-60,111]],['earthworm',[-45,83]],['earthworm',[-38,92]],['earthworm',[-20,93]],['earthworm',[-14,73]],
            ['slime',[-105,103]],['slime',[-93,67]],['slime',[-93,90]],['slime',[-90,111]],['slime',[-84,79]],['slime',[-70,104]],['slime',[-69,116]],['slime',[-61,92]],['slime',[-58,82]],['slime',[-47,115]],['slime',[-41,104]],['slime',[-26,79]],['slime',[-26,88]],['slime',[-18,74]],['slime',[-13,83]],['slime',[-13,107]],
            ['spider',[-102,105]],['spider',[-97,77]],['spider',[-89,97]],['spider',[-88,80]],['spider',[-85,114]],['spider',[-72,85]],['spider',[-67,116]],['spider',[-42,115]],['spider',[-40,104]],['spider',[-30,80]],['spider',[-17,108]],
            ['volatile',[-106,101]],['volatile',[-104,73]],['volatile',[-100,64]],['volatile',[-97,91]],['volatile',[-87,99]],['volatile',[-82,113]],['volatile',[-79,74]],['volatile',[-69,81]],['volatile',[-65,104]],['volatile',[-59,111]],['volatile',[-53,94]],['volatile',[-43,83]],['volatile',[-33,95]],['volatile',[-33,103]],['volatile',[-23,87]],['volatile',[-20,75]]
        ];
        // 水晶格集合 — 怪物生成时跳过, 避免怪物和水晶同格 (level_1780314495543)
        const _sz3CrystalCells = new Set([
            [-106,63],[-106,82],[-106,99],[-104,70],[-104,88],[-103,105],[-99,64],[-99,93],[-98,60],[-98,86],[-97,77],[-96,102],[-96,108],[-92,65],[-91,77],[-90,90],[-89,107],[-88,99],[-88,113],[-85,70],[-84,102],[-82,77],[-82,86],[-82,95],[-77,108],[-76,100],[-75,73],[-75,79],[-74,69],[-74,115],[-73,86],[-73,111],[-70,104],[-70,111],[-67,83],[-66,73],[-66,101],[-66,109],[-66,115],[-64,89],[-62,77],[-58,82],[-58,88],[-57,106],[-56,93],[-55,112],[-52,74],[-50,98],[-50,111],[-48,83],[-48,92],[-46,104],[-43,80],[-41,115],[-40,89],[-37,99],[-35,95],[-34,104],[-33,76],[-33,91],[-29,86],[-28,80],[-28,100],[-25,72],[-24,87],[-24,103],[-22,82],[-21,76],[-20,107],[-19,99],[-18,67],[-17,92],[-16,108],[-15,79],[-15,84],[-15,88],[-14,73],[-13,102],[-12,68],[-12,107]
        ].map(([c,r]) => c + ',' + r));
        _sz3Monsters.forEach(([type, [c, r]]) => {
            if (_sz3CrystalCells.has(c + ',' + r)) return;  // 该格放水晶, 不放怪
            airRange(c, r, c, r); _spawnSZ3Monster(type, c, r);
        });

        // === level_1780314495543.json — 80 个蓝水晶矿 ===
        if (typeof CrystalBlock !== 'undefined') {
            if (!this._crystalOres) this._crystalOres = [];
            _sz3CrystalCells.forEach(key => {
                const [c, r] = key.split(',').map(Number);
                airRange(c, r, c, r);
                const ore = new CrystalBlock(this, c * G + G/2, r * G + G/2, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) { try { this.uiCam.ignore(ore.sprite); } catch(e) {} }
            });
        }

        // === 宝箱 (-29,44),(-16,74),(-95,67),(-85,114),(-13,83) — 自注册到 this._chests ===
        if (typeof Chest !== 'undefined') {
            [[-29, 44], [-16, 74], [-96, 66], [-85, 114], [-13, 83], [-80, 38]].forEach(([c, r]) => { airRange(c, r, c, r); new Chest(this, c, r); });
        }

        // === 3 个骷髅 hint (Corpse + Hint), (-27,88) 给玩具 ===
        if (typeof Corpse !== 'undefined' && typeof Hint !== 'undefined') {
            const _skel = [
                { col: -87, row: 80, variant: 'corpse3', lines: [
                    { speaker: 'You', text: "A huge skeleton... terrifying even in death. It clutches a book of last words." }
                ] },
                { col: -27, row: 88, dy: 0.5, variant: 'corpse1', toy: true, lines: [   // (用户) dy=0.5 格 = 视觉下移 16px
                    { speaker: 'You', text: "A long-dead skeleton, hands still gripping a toy, refusing to let go." },
                    { speaker: 'You', text: '*Toy +1*' }
                ] },
                { col: -70, row: 116, variant: 'corpse2', lines: [
                    { speaker: 'Last Words', text: '"I hate them... they just abandoned us, threw us away..."' }
                ] }
            ];
            _skel.forEach(sp => {
                airRange(sp.col, sp.row, sp.col, sp.row);
                new Corpse(this, sp.col, sp.row + (sp.dy || 0), sp.variant);
                new Hint(this, sp.col, sp.row + (sp.dy || 0), {
                    onInteract: (firstTime) => {
                        if (!this.dialogSystem) return;
                        if (firstTime) {
                            this.dialogSystem.showSequence(sp.lines, () => {
                                this.dialogSystem.close();
                                if (sp.toy) this._sz3HasToy = true;  // 拿到玩具 → Toy CNPC 任务可交付
                            });
                        } else {
                            // (用户) 重看 = 检视/遗言全文重播; 仅"拾取玩具"行替换为已取提示
                            const replay = sp.toy
                                ? sp.lines.slice(0, -1).concat([{ speaker: 'You', text: 'I already have the toy.' }])
                                : sp.lines.slice();
                            this.dialogSystem.showSequence(replay);
                        }
                    }
                });
            });
        }

        if (typeof YCrystalBlock !== "undefined") {
            if (!this._yCrystalOres) this._yCrystalOres = [];
            const yCells = [
                [-85, 64],
                [-88, 59],
                [-91, 53],
                [-90, 46],
                [-85, 44],
                [-79, 43],
                [-77, 46],
                [-77, 51],
                [-76, 55],
                [-75, 59],
                [-81, 54],
                [-82, 51],
                [-85, 48],
                [-88, 50],
                [-88, 54],
                [-86, 57],
                [-83, 60],
                [-79, 57],
                [-79, 63],
                [-75, 62],
                [-70, 57],
                [-64, 52],
                [-55, 54],
                [-45, 53],
                [-38, 50],
                [-30, 51],
                [-42, 57],
                [-59, 57],
                [-53, 62],
                [-60, 65],
                [-68, 63],
                [-66, 66],
                [-56, 68],
                [-47, 65],
                [-43, 62],
                [-39, 66],
                [-50, 57],
                [-36, 55],
                [-29, 55],
                [-36, 43],
                [-28, 40],
                [-31, 45],
                [-37, 39],
                [-33, 34],
                [-41, 35],
                [-53, 49],
                [-45, 48],
                [-40, 44],
                [-47, 41],
                [-53, 42],
                [-49, 46],
                [-84, 35],
                [-79, 38],
                [-72, 37],
                [-61, 35],
                [-54, 37],
                [-64, 37],
                [-60, 42],
                [-27, 43],
                [-31, 37]
            ];
            yCells.forEach(([c, r]) => {
                airRange(c, r, c, r);
                const ore = new YCrystalBlock(this, c * G + G/2, r * G + G/2, { hp: 12, dropCount: 1 });
                this._yCrystalOres.push(ore);
                if (this.uiCam && ore.sprite) { try { this.uiCam.ignore(ore.sprite); } catch(e) {} }
            });
        }

        // === [用户追加地形] cavetilewall 范围 + JSON 编辑 — 放在所有怪物/方块放置之后, 占位则删怪/方块 ===
        const _clearEntitiesAt = (col, row) => {
            ['spiders','bats','slimes','beetles','earthworms','bungeeSpiders','mimicOres','volatileCrystals','crystalBlocks'].forEach(gn => {
                const grp = this[gn];
                if (grp && grp.getChildren) grp.getChildren().slice().forEach(m => {
                    if (Math.floor(m.x / G) === col && Math.floor(m.y / G) === row) { try { m.destroy(); } catch(e) {} }
                });
            });
            // 也清掉该格 _crystalOres / _yCrystalOres 数组里的水晶 (它们在数组里不在 group, 否则放墙时旧水晶贴图残留 = 蓝水晶 bug)
            ['_crystalOres','_yCrystalOres'].forEach(an => {
                const arr = this[an];
                if (Array.isArray(arr)) {
                    this[an] = arr.filter(ore => {
                        if (ore && Math.floor(ore.x / G) === col && Math.floor(ore.y / G) === row) {
                            if (ore.sprite) { try { ore.sprite.destroy(); } catch(e) {} }
                            ore.destroyed = true;
                            return false;
                        }
                        return true;
                    });
                }
            });
        };
        const _cavetileSolid = (c, r) => { _clearEntitiesAt(c, r); airRange(c, r, c, r); cavetileRange(c, r, c, r); };
        const _placeCrystal = (c, r) => {
            _clearEntitiesAt(c, r); airRange(c, r, c, r);
            if (typeof CrystalBlock !== 'undefined') {
                if (!this._crystalOres) this._crystalOres = [];
                const ore = new CrystalBlock(this, c * G + G/2, r * G + G/2, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) { try { this.uiCam.ignore(ore.sprite); } catch(e) {} }
            }
        };

        // (1) 显式 cavetilewall 范围 (用户指定)
        for (let c = -30; c <= -23; c++) for (let r = 15; r <= 19; r++) _cavetileSolid(c, r);   // (-30,15)→(-23,19)
        for (let c = -88; c <= -46; c++) for (let r = 15; r <= 18; r++) _cavetileSolid(c, r);   // (-46,15)→(-88,18)

        // (2) JSON level_1780409425219 编辑 (按历史顺序, 后者覆盖前者; w=cavetile, c=crystal, a=air)
        const _jsonEdits = [
            [-93,67,'w'],[-94,67,'w'],[-92,66,'w'],[-93,66,'w'],[-92,65,'w'],[-93,65,'w'],
            [-92,64,'w'],[-93,64,'w'],[-92,63,'w'],[-93,63,'w'],[-93,62,'w'],[-94,62,'w'],
            [-94,61,'w'],[-95,61,'w'],[-95,60,'w'],[-96,60,'w'],
            [-95,62,'c'],[-94,65,'c'],
            [-96,67,'w'],[-95,67,'w'],[-94,66,'w'],
            [-66,72,'w'],[-67,72,'w'],[-68,71,'w'],[-69,71,'w'],[-70,71,'w'],[-71,71,'w'],
            [-72,71,'w'],[-72,70,'w'],[-73,70,'w'],[-74,70,'w'],[-75,70,'w'],[-73,69,'w'],
            [-74,69,'w'],[-75,69,'w'],[-76,69,'w'],[-77,69,'w'],[-80,69,'w'],[-79,69,'w'],
            [-78,69,'w'],[-78,70,'w'],[-77,70,'w'],[-76,70,'w'],
            [-72,71,'a'],[-71,71,'a'],
            [-70,72,'c'],[-78,71,'c'],
            [-32,113,'a'],[-31,113,'a'],[-30,113,'a'],[-32,114,'a'],[-31,114,'a'],[-30,114,'a'],
            [-32,115,'a'],[-31,115,'a'],[-30,115,'a'],
            [-29,116,'w'],[-28,116,'w'],[-27,116,'w'],[-26,116,'w'],[-25,116,'w'],
            [-29,117,'w'],[-28,117,'w'],[-27,117,'w'],[-26,117,'w'],[-25,117,'w'],
            [-29,118,'w'],[-28,118,'w'],[-27,118,'w'],[-26,118,'w'],[-25,118,'w'],
            [-29,119,'w'],[-28,119,'w'],[-27,119,'w'],[-26,119,'w'],[-25,119,'w'],
            [-29,120,'w'],[-28,120,'w'],[-27,120,'w'],[-26,120,'w'],[-25,120,'w']
        ];
        _jsonEdits.forEach(([c, r, t]) => {
            if (t === 'w') _cavetileSolid(c, r);
            else if (t === 'c') _placeCrystal(c, r);
            else { _clearEntitiesAt(c, r); airRange(c, r, c, r); }
        });

        // (3) 补漏 — JSON 标记为 wall 但之前转录遗漏的 49 格 (cols -27..-33, rows 25..36)
        const _missingWalls = [
            [-33,25],[-32,26],[-31,26],[-30,26],[-32,27],[-31,27],[-30,27],[-29,27],
            [-28,27],[-32,28],[-31,28],[-30,28],[-29,28],[-28,28],[-27,28],[-32,29],
            [-31,29],[-30,29],[-29,29],[-28,29],[-27,29],[-30,30],[-29,30],[-28,30],
            [-27,30],[-30,31],[-29,31],[-28,31],[-27,31],[-31,32],[-30,32],[-29,32],
            [-28,32],[-27,32],[-32,33],[-31,33],[-30,33],[-29,33],[-28,33],[-27,33],
            [-32,34],[-31,34],[-30,34],[-29,34],[-28,34],[-31,35],[-30,35],[-29,35],
            [-30,36]
        ];
        _missingWalls.forEach(([c, r]) => _cavetileSolid(c, r));

        // (用户) (-7,61)→(-22,58) 全部生成 cavetilewall
        for (let c = -22; c <= -7; c++) for (let r = 58; r <= 61; r++) _cavetileSolid(c, r);

        // (用户) (-84,36) + (-89,31)→(-94,37) 生成 cavetilewall (稍后在皮肤段应用 Yellow_dirt 皮肤)
        _cavetileSolid(-84, 36);
        for (let c = -94; c <= -89; c++) for (let r = 31; r <= 37; r++) _cavetileSolid(c, r);

        // (用户) (-35,14)→(-25,8) + (-41,14)→(-51,8) 生成 cavetilewall
        for (let c = -35; c <= -25; c++) for (let r = 8; r <= 14; r++) _cavetileSolid(c, r);
        for (let c = -51; c <= -41; c++) for (let r = 8; r <= 14; r++) _cavetileSolid(c, r);

        if (typeof CavetileWall !== 'undefined' && CavetileWall.renderSkins) CavetileWall.renderSkins(this);
    }
}
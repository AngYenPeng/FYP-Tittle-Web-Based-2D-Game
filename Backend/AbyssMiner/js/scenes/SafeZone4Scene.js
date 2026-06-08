/**
 * SafeZone4Scene — 1 号安全区
 * 玩家通过 Tutorial SecretDoor 进入这里
 * 场景大小 = 屏幕可视范围（zoom 1.25 下：1280×720）
 * 继承 Tutorial 的物品/背包/水晶等状态
 */
class SafeZone4Scene extends MainGameScene {

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
            // CCD 防穿墙: 飞行中扫掠这帧 body 移动线, 穿过墙(含空气墙 _pickExtraWalls)就回溯钉在墙面
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

        // (用户) 飞行稿子撞蝙蝠巢穴 → 巢穴掉血 (高处巢用丢稿子打)
        if (this._sz4BatNests && this._sz4BatNests.length) {
            [this.pick1, this.pick2].forEach(pk => {
                if (!pk || pk.state !== 'flying_max') return;
                this._sz4BatNests.slice().forEach(n => {
                    if (!n || n.hp === undefined || n.hp <= 0) return;
                    if (Phaser.Math.Distance.Between(pk.x, pk.y, n.x, n.y) < 38) {
                        n.takeDamage(2);
                        this.recallSystem.startRecall(pk, true);
                        this._pickThrowCooldownUntil = this.time.now + 200;
                    }
                });
            });
        }

        // (保底) 飞行稿子撞蝙蝠 → 蝙蝠掉血 (overlap 失效时后备; overlap 在物理步先触发会改 state, 同帧此处因 state≠flying_max 自动跳过, 不会双倍)
        if (this.bats && this.bats.getChildren) {
            [this.pick1, this.pick2].forEach(pk => {
                if (!pk || pk.state !== 'flying_max') return;
                this.bats.getChildren().forEach(b => {
                    if (!b || !b.active || b.hp === undefined || b.hp <= 0) return;
                    if (Phaser.Math.Distance.Between(pk.x, pk.y, b.x, b.y) < 30) {
                        if (typeof b.takeDamage === 'function') b.takeDamage(2, this.player.x, this.player.y);
                        this.recallSystem.startRecall(pk, true);
                        this._pickThrowCooldownUntil = this.time.now + 200;
                    }
                });
            });
        }

        // (用户) 飞行稿子撞蝙蝠 boss → boss 掉血 + 立刻收回 + 0.2s 冷却 (boss 在 _bosses 数组, 非 mob 组)
        if (this._bosses && this._bosses.length) {
            [this.pick1, this.pick2].forEach(pk => {
                if (!pk || pk.state !== 'flying_max') return;
                this._bosses.forEach(boss => {
                    if (!boss || !boss.sprite || boss.hp === undefined || boss.hp <= 0) return;
                    if (Phaser.Math.Distance.Between(pk.x, pk.y, boss.sprite.x, boss.sprite.y) < 55) {
                        if (typeof boss.takeDamage === 'function') boss.takeDamage(2);
                        this.recallSystem.startRecall(pk, true);
                        this._pickThrowCooldownUntil = this.time.now + 200;
                    }
                });
            });
        }

        this.grappleSystem.update();
        this.recallSystem.update();
        this.throwSystem.updateUI();
    }


    constructor() {
        super();
        Phaser.Scene.call(this, { key: 'SafeZone4Scene' });
    }

    init(data) {
        // 接收上一个场景传来的状态（由 SecretDoor 传入）
        this._inheritedData = data || {};
    }

    preload() {
        if (typeof super.preload === 'function') super.preload();
        // (用户) 背景图层 — SZ4 三层
        this.load.image('sz4_bg_L1', 'assets/images/sz4_bg_L1.png');
        this.load.image('sz4_bg_L2', 'assets/images/sz4_bg_L2.png');
        this.load.image('sz4_bg_L3', 'assets/images/sz4_bg_L3.png');
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_SafeZone4');  // BGM (SafeZone4.mp3 放进 BGM/ 即生效)

        // pickaxeUpgraded — 从 registry 读 (跨场景有效, 刷新网页自动重置 — 暂无后台存档)
        this._pickaxeUpgraded = !!this.registry.get('pickaxeUpgraded');  // (用户修复) 原"进场即解锁"是开发捷径 — 改从 registry 读
        // (用户修复) 场景重启 (Save&Exit → Resume) 实例属性残留: boss 显示已死/剧情不播/空气墙不建
        this._batBoss = null; this._batBossAwake = false; this._batBossDead = false;
        this._batBossDeathStarted = false; this._batBossCrashing = false; this._batBossLanded = false;
        if (this._batBossCrashGuard) { try { this._batBossCrashGuard.remove(); } catch (e) {} }
        this._batBossCrashGuard = null;
        this._sz4CutsceneStarted = false; this._sz4CutsceneActive = false; this._sz4CutsceneDone = false;
        this._sz4CutsceneCrystal = null; this._sz4BossActive = false;
        this._sz4InBossRoomNow = false; this._sz4WasInBossRoom = false;
        this._sz4PlayerWall = null; this._sz4AirWall = null; this._sz4BatNests = null;
        this._sz4MonsterWallsBuilt = false;
        this._sz4CutPhase = null;
        if (this._sz4PanGuard) { try { this._sz4PanGuard.remove(); } catch (e) {} }
        this._sz4PanGuard = null;
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

        // === SZ4 3 层背景 (SZ1/2 同款管线: 原生尺寸不缩放; 仅 L2 左右视差 sf 0.5, Y 1:1) ===
        // depth: L3 最深(-103) → L2(-102) → L1 最前(-101); 锚点暂置地图中心, 待按格微调
        {
            const bgX = W / 2 - 31 * 32, bgY = H / 2 - 1 * 32;   // (用户) 左移 31 格 (原20再左11) + 上移 1 格
            if (this.textures.exists('sz4_bg_L3')) this.bgL3 = this.add.image(bgX, bgY, 'sz4_bg_L3').setScrollFactor(1, 1).setDepth(-103);
            if (this.textures.exists('sz4_bg_L2')) this.bgL2 = this.add.image(bgX - 20 * 32, bgY, 'sz4_bg_L2').setScrollFactor(0.5, 1).setDepth(-102);
            if (this.textures.exists('sz4_bg_L1')) this.bgL1 = this.add.image(bgX, bgY, 'sz4_bg_L1').setScrollFactor(1, 1).setDepth(-101);
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

        // GridSystem
        // === 地图重置: 以出生点 (col -25, row 18) 为基准 — 左100 右200 上150 下150 格 ===
        const BUF_T = 20, BUF_B = 20, BUF_L = 39, BUF_R = 50;  // 保留供下方代码引用
        // (用户) 世界裁剪: 旧网格 301×301 = 90,601 格 (创造模式画布遗留), 实际玩法区才 ~1,400 格.
        // 按 镜头chunk(-35..13 / -4..23) + 空气墙(-37) + 旧边界(-39) 留余量, 裁到 66×45 = 2,970 格 (缩 30 倍)
        const originX = -45 * G;
        const originY = -14 * G;
        const totalW = (20 - (-45) + 1) * G;      // cols -45..20
        const totalH = (30 - (-14) + 1) * G;      // rows -14..30
        this.gridSystem = new GridSystem(this, G, totalW, totalH, originX, originY);

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
        this.bats = this.physics.add.group({ allowGravity: false });
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
        // === SZ4 地形 (创意模式 JSON level_1780414961018) — 512 格 cavetilewall ===
        const _sz4Walls = [[-12,-5],[-11,-5],[-10,-5],[-9,-5],[-8,-5],[-7,-5],[-6,-5],[-5,-5],[-4,-5],[-3,-5],[-2,-5],[-1,-5],[0,-5],[1,-5],[2,-5],[3,-5],[4,-5],[5,-5],[6,-5],[7,-5],[8,-5],[9,-5],[10,-5],[11,-5],[12,-5],[13,-5],[14,-5],[-12,-4],[-11,-4],[-10,-4],[-9,-4],[-8,-4],[-7,-4],[-6,-4],[-5,-4],[-4,-4],[-3,-4],[-2,-4],[-1,-4],[0,-4],[1,-4],[2,-4],[3,-4],[4,-4],[5,-4],[6,-4],[7,-4],[8,-4],[9,-4],[10,-4],[11,-4],[12,-4],[13,-4],[14,-4],[-12,-3],[-11,-3],[-10,-3],[-9,-3],[-8,-3],[-7,-3],[-6,-3],[-5,-3],[-4,-3],[-3,-3],[-2,-3],[-1,-3],[0,-3],[1,-3],[2,-3],[3,-3],[4,-3],[5,-3],[6,-3],[7,-3],[8,-3],[9,-3],[10,-3],[11,-3],[12,-3],[13,-3],[14,-3],[-12,-2],[-11,-2],[-10,-2],[12,-2],[13,-2],[14,-2],[-12,-1],[-11,-1],[13,-1],[14,-1],[-12,0],[-11,0],[13,0],[14,0],[-12,1],[-11,1],[13,1],[14,1],[-12,2],[-11,2],[13,2],[14,2],[-12,3],[-11,3],[13,3],[14,3],[-12,4],[-11,4],[13,4],[14,4],[-12,5],[-11,5],[-4,5],[-3,5],[-2,5],[-1,5],[3,5],[4,5],[5,5],[6,5],[13,5],[14,5],[-12,6],[-11,6],[-3,6],[-2,6],[4,6],[5,6],[13,6],[14,6],[-15,7],[-14,7],[-13,7],[-12,7],[-11,7],[13,7],[14,7],[-15,8],[-14,8],[-13,8],[-12,8],[-11,8],[13,8],[14,8],[-37,9],[-36,9],[-35,9],[-34,9],[-33,9],[-32,9],[-31,9],[-30,9],[-29,9],[-28,9],[-27,9],[-26,9],[-25,9],[-24,9],[-23,9],[-22,9],[-21,9],[-20,9],[-19,9],[-18,9],[-17,9],[-16,9],[-15,9],[-14,9],[-13,9],[-12,9],[-11,9],[13,9],[14,9],[-37,10],[-36,10],[-35,10],[-34,10],[-33,10],[-32,10],[-31,10],[-30,10],[-29,10],[-28,10],[-27,10],[-26,10],[-25,10],[-24,10],[-23,10],[-22,10],[-21,10],[-20,10],[-19,10],[-18,10],[-17,10],[-16,10],[-15,10],[-14,10],[-13,10],[-12,10],[-11,10],[-10,10],[-9,10],[-8,10],[10,10],[11,10],[12,10],[13,10],[14,10],[-37,11],[-36,11],[-35,11],[-34,11],[-33,11],[-32,11],[-31,11],[-30,11],[-29,11],[-28,11],[-27,11],[-26,11],[-25,11],[-24,11],[-23,11],[-22,11],[-21,11],[-20,11],[-19,11],[-18,11],[-17,11],[-16,11],[-15,11],[-14,11],[-13,11],[-12,11],[-11,11],[-10,11],[-9,11],[11,11],[12,11],[13,11],[14,11],[-37,12],[-36,12],[-35,12],[-34,12],[-33,12],[-32,12],[-31,12],[-30,12],[-29,12],[-28,12],[-27,12],[-26,12],[-25,12],[-24,12],[-23,12],[-22,12],[-21,12],[-20,12],[-19,12],[-18,12],[-17,12],[-16,12],[-15,12],[-14,12],[13,12],[14,12],[-37,13],[-36,13],[-35,13],[-34,13],[-33,13],[-32,13],[-31,13],[-30,13],[-29,13],[-28,13],[-27,13],[-26,13],[-25,13],[-24,13],[-23,13],[-22,13],[-21,13],[-20,13],[13,13],[14,13],[-37,14],[-36,14],[-35,14],[-34,14],[-33,14],[-32,14],[-31,14],[-30,14],[-29,14],[-28,14],[-1,14],[0,14],[1,14],[2,14],[3,14],[13,14],[14,14],[-37,15],[-36,15],[-35,15],[-34,15],[-33,15],[-32,15],[-31,15],[0,15],[1,15],[2,15],[13,15],[14,15],[-37,16],[-36,16],[-35,16],[-34,16],[13,16],[14,16],[13,17],[14,17],[13,18],[14,18],[13,19],[14,19],[-37,20],[-36,20],[-14,20],[-13,20],[-12,20],[-11,20],[-10,20],[-9,20],[11,20],[12,20],[13,20],[14,20],[-37,21],[-36,21],[-14,21],[-13,21],[-12,21],[-11,21],[-10,21],[-9,21],[-5,21],[-4,21],[0,21],[1,21],[2,21],[6,21],[7,21],[11,21],[12,21],[13,21],[14,21],[-37,22],[-36,22],[-35,22],[-34,22],[-33,22],[-32,22],[-31,22],[-30,22],[-29,22],[-28,22],[-27,22],[-26,22],[-25,22],[-24,22],[-23,22],[-22,22],[-21,22],[-20,22],[-19,22],[-18,22],[-17,22],[-16,22],[-15,22],[-14,22],[-13,22],[-12,22],[-11,22],[-10,22],[-9,22],[-8,22],[-6,22],[-5,22],[-4,22],[-3,22],[-1,22],[0,22],[1,22],[2,22],[3,22],[5,22],[6,22],[7,22],[8,22],[10,22],[11,22],[12,22],[13,22],[14,22],[-37,23],[-36,23],[-35,23],[-34,23],[-33,23],[-32,23],[-31,23],[-30,23],[-29,23],[-28,23],[-27,23],[-26,23],[-25,23],[-24,23],[-23,23],[-22,23],[-21,23],[-20,23],[-19,23],[-18,23],[-17,23],[-16,23],[-15,23],[-14,23],[-13,23],[-12,23],[-11,23],[-10,23],[-9,23],[-8,23],[-7,23],[-6,23],[-5,23],[-4,23],[-3,23],[-2,23],[-1,23],[0,23],[1,23],[2,23],[3,23],[4,23],[5,23],[6,23],[7,23],[8,23],[9,23],[10,23],[11,23],[12,23],[13,23],[14,23],[-37,24],[-36,24],[-35,24],[-34,24],[-33,24],[-32,24],[-31,24],[-30,24],[-29,24],[-28,24],[-27,24],[-26,24],[-25,24],[-24,24],[-23,24],[-22,24],[-21,24],[-20,24],[-19,24],[-18,24],[-17,24],[-16,24],[-15,24],[-14,24],[-13,24],[-12,24],[-11,24],[-10,24],[-9,24],[-8,24],[-7,24],[-6,24],[-5,24],[-4,24],[-3,24],[-2,24],[-1,24],[0,24],[1,24],[2,24],[3,24],[4,24],[5,24],[6,24],[7,24],[8,24],[9,24],[10,24],[11,24],[12,24],[13,24],[14,24]];
        {
            const _seen = new Set();
            // (用户 JSON level_1780483341195) 删掉这几格的墙 → 可穿过 (荆棘保留); 预先标记跳过, 不生成 CavetileWall
            ['-5,21', '0,21', '1,21', '2,21', '7,21'].forEach(k => _seen.add(k));
            _sz4Walls.forEach(([c, r]) => {
                const k = c + ',' + r;
                if (_seen.has(k)) return; _seen.add(k);
                new CavetileWall(this, c * G + G / 2, r * G + G / 2, G, G);
            });
            // (用户) (-15,20)→(-35,21) 生成 cavetilewall (同一去重集)
            for (let c = -35; c <= -15; c++) for (let r = 20; r <= 21; r++) {
                const k = c + ',' + r;
                if (_seen.has(k)) continue; _seen.add(k);
                new CavetileWall(this, c * G + G / 2, r * G + G / 2, G, G);
            }
            // (用户 JSON level_1780478923160) 新增 wall (同一去重集)
            [[-7,22],[-8,21],[-8,20],[-4,20],[-4,21],[-3,20],[-3,21],[-2,20],[-2,21],[-2,22],[-1,20],[-1,21],[-1,15],[-2,15],[3,15],[4,15],[3,20],[3,21],[4,20],[4,21],[4,22],[5,20],[5,21],[6,20],[6,21],[9,22],[10,20],[10,21]].forEach(([c, r]) => {
                const k = c + ',' + r;
                if (_seen.has(k)) return; _seen.add(k);
                new CavetileWall(this, c * G + G / 2, r * G + G / 2, G, G);
            });
        }

        // 应用 level data — 已停用 (地图重置: 不再加载旧地形/怪物/boss)
        // this._applyLevelData();

        // 物理边界扩展到包含全部扩展区（右 +50 格 + 上 +100 格）
        this.physics.world.setBounds(originX, originY, totalW, totalH);

        // (用户) 删掉重复的 renderSkins — 这里跑一遍、后面"渲染 CavetileWall 皮肤"又跑一遍,
        //        全图几千面墙的皮肤计算白做一次, 是重进存档卡顿的大头之一 (真正的调用在后面)

        // === (用户 JSON level_1780478923160) 危险物 + 暗门 ===
        // thorns (9) — 地面尖刺
        if (typeof Thorns !== 'undefined') {
            [[-7,21],[-6,21],[-5,21],[0,21],[1,21],[2,21],[7,21],[8,21],[9,21]].forEach(([c, r]) => new Thorns(this, c, r));
        }
        // (用户) 区2 水晶矿 (-8,19) — 区2剧情玩家敲碎并拾取
        if (typeof CrystalBlock !== 'undefined') {
            this._sz4CutsceneCrystal = new CrystalBlock(this, -8 * G + G / 2, 19 * G + G / 2, { hp: 10, dropCount: 1 });
        }
        // (用户 JSON level_1780733998857) 新增 6 颗蓝水晶 (全部原 air, 免挖)
        if (typeof CrystalBlock !== 'undefined') {
            [[-29,19],[-22,19],[-16,19],[-16,13],[-27,14],[-32,16]].forEach(([c, r]) => {
                const cb = new CrystalBlock(this, c * G + G / 2, r * G + G / 2, { hp: 10, dropCount: 1 });
                if (cb.redetectRotation) cb.redetectRotation();
                if (!this._crystalOres) this._crystalOres = [];   // 登记近战可破坏列表 — 漏了会打不到 (L1592 同款教训)
                this._crystalOres.push(cb);
                if (this.uiCam && cb.sprite) { try { this.uiCam.ignore(cb.sprite); } catch (e) {} }
            });
        }
        // stalactite (23) — 顶部一排, ceiling 装饰
        if (typeof Stalactite !== 'undefined') {
            [[-10,-1],[-9,-2],[-8,-2],[-7,-2],[-6,-2],[-5,-2],[-4,-2],[-3,-2],[-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2],[3,-2],[4,-2],[5,-2],[6,-2],[7,-2],[8,-2],[9,-2],[10,-2],[11,-2],[12,-1]]
                .forEach(([c, r]) => new Stalactite(this, c * G + G / 2, { mode: 'ceiling', ceilingY: r * G }));
        }
        // bat_nest (5) — 存数组, 玩家进 boss 房 (封门激活) 时 startSummoning
        this._batZoneCap = 20;   // (用户) 区2 最多 20 只小蝙蝠
        this._sz4BatNests = [];
        if (typeof BatNest !== 'undefined') {
            [[11,9],[4,4],[-2,4],[-9,9],[1,13]].forEach(([c, r]) => this._sz4BatNests.push(new BatNest(this, c, r)));
        }
        // secret_door — 往右 0.5 格 (11.5→12) + 往下 0.5 格 (18.5→19)
        if (typeof SecretDoor !== 'undefined') {
            // (用户·临时) 预览通关画面: 进暗门直接结算 (蓝转黄 + RankingSystem, noRecord 不写 RECORDS).
            //   还原 = 删掉 onConfirm 整段即可恢复传送 SafeZone5Scene
            this._sz4SecretDoor = new SecretDoor(this, 12 * G, 19 * G, { pairId: 'sz4_secret', w: 2 * G, h: 2 * G, locked: true, targetScene: 'SafeZone5Scene',
                onConfirm: () => {
                    if (this.hudSystem && this.hudSystem.convertBlueToYellow) this.hudSystem.convertBlueToYellow();
                    if (!this._rankingSystem && typeof RankingSystem !== 'undefined') {
                        this._rankingSystem = new RankingSystem(this);
                        this._rankingSystem.show(this.hudSystem ? (this.hudSystem.yellowCrystalCount || 0) : 0);   // (用户) 转正: 正常落 RECORDS + GAME CLEAR 标记
                    }
                }
            });
            if (!this._secretDoors) this._secretDoors = [];
            this._secretDoors.push(this._sz4SecretDoor);   // 注册到 InteractSystem (E 提示 + 交互)
        }

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
        const spawnX = -35 * G + G / 2;
        const spawnY = 18 * G + G / 2;
        this.spawnX = spawnX;
        this.spawnY = spawnY;
        this.player = new Player(this, spawnX, spawnY);

        // 真稿子系统 (替换 stub) — 右键丢/grapple/换手
        this._setupRealPickaxes();
        this._registerPickMonsterHits();

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
        this.inventorySystem = new BackpackSystem(this);  this.inventorySystem.init();
        this.backpackSystem  = this.inventorySystem;
        this.hudSystem       = new HUDSystem(this);       this.hudSystem.init();
        this.diseaseSystem   = new DiseaseSystem(this);   this.diseaseSystem.init();   // (用户) SZ4 漏建 — 腐蚀条/蜘蛛毒/boss侵蚀在本区全部静默失效
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
                        // (用户) 下落时长按重力换算 t=√(2d/g) — 原固定 175ms 在长落差下像瞬移, 比玩家落地还快
                        targets: c, y: targetY,
                        duration: Math.max(175, Math.sqrt(2 * Math.max(1, targetY - peakY) / ((this.physics && this.physics.world && this.physics.world.gravity.y) || 1200)) * 1000),
                        ease: 'Quad.easeIn',
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
        this._chunks = [
            { id: 'zone1', x1: -35, y1: 10, x2: -11, y2: 23 },   // 出生区
            { id: 'zone2', x1: -11, y1: -4, x2: 13,  y2: 23 }    // boss 房 (BatBoss 在此)
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

        // === 玩家空气墙 (-37,17)→(-36,19): cols -37..-36, rows 17..19 ===
        {
            const aw = this.add.rectangle(-36 * G, 18.5 * G, 2 * G, 3 * G, 0x000000, 0);
            this.physics.add.existing(aw, true);
            this.physics.add.collider(this.player, aw);
            if (this.uiCam) { try { this.uiCam.ignore(aw); } catch(e) {} }
            this._sz4AirWall = aw;
            this._registerPickBlocker(aw);   // (用户) 这面挡玩家空气墙之前漏登记 → 稿子从这穿出世界外; 现在按真墙处理
        }

        // === BatBoss at (1,10) — arena = zone2 (boss 房) ===
        if (typeof BatBoss !== 'undefined') {
            const batArena = { x1: -11 * G, y1: -4 * G, x2: 14 * G, y2: 24 * G };
            this._batBoss = new BatBoss(this, 1 * G + G / 2, -1 * G + G / 2, { arena: batArena, ceilingTop: -2 * G, groundY: 24 * G });  // (用户) 挂天花板 (1,-1), 区2剧情唤醒
            if (!this._bosses) this._bosses = [];
            this._bosses.push(this._batBoss);
            this._batBoss._attackEnabled = false;  // 区2剧情结束前不攻击
            this._batBossAwake = false;            // 区2剧情唤醒前不跑 AI (挂在天花板不动)
            // (用户) 唤醒前 = 睡觉姿势: 停掉构造器默认的飞行循环, 定格 Bat_boss_wakes_up 第 0 帧
            // (修复: 镜头第一次揭示 boss 时露 0.几秒飞行动画, 之后才播苏醒 — 起床前不该飞)
            if (this._batBoss.sprite && this.textures.exists('Bat_boss_wakes_up')) {
                try { this._batBoss.sprite.anims.stop(); } catch (e) {}
                this._batBoss.sprite.setTexture('Bat_boss_wakes_up', 0);
            }
            // 睡眠期间隐藏血条 (剧情结束才显示)
            if (this._batBoss._hpBg)  this._batBoss._hpBg.setVisible(false);
            if (this._batBoss._hpBar) this._batBoss._hpBar.setVisible(false);
            this.events.on('batboss_defeated', (data) => {
                if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_SafeZone4');  // (用户) boss 死 → 退回区域 BGM
                if (this._batBossDeathStarted) return;
                this._batBossDeathStarted = true;
                this._batBossDead = true;
                if (this._sz4SecretDoor) this._sz4SecretDoor.locked = false;   // #3 boss 死后解锁暗门 → 可见 E + 可交互 → 传送 SZ5
                const boss = this._batBoss;
                const lx = (data && data.x != null) ? data.x : (boss ? boss.x : 0);
                const ly = (data && data.y != null) ? data.y : (boss ? boss.y : 0);
                // #6 最后咆哮 1 秒: 震屏 1s, 不掉钟乳石
                if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this, 'Bat_Death');   // (用户) 死亡音效 (最后咆哮→死亡)
                if (this.cameras && this.cameras.main) this.cameras.main.shake(1000, 0.012);
                if (boss && boss.sprite) {
                    // (用户) 死亡咆哮配 Bat_boss_roar (播完定格末帧当瘫软); 小蝙蝠 fallback 皮才用 bat_injuried
                    if (this.anims.exists('bat_boss_roar') && boss.sprite.texture && String(boss.sprite.texture.key).startsWith('Bat_boss')) {
                        boss.sprite.play('bat_boss_roar', true);
                    } else if (this.anims.exists('bat_injuried')) boss.sprite.play('bat_injuried', true);
                    else if (this.anims.exists('bat_dead')) boss.sprite.play('bat_dead', true);
                }
                // 咆哮完 (1s): 所有蝙蝠 + 巢死亡 + boss 立刻坠机
                this.time.delayedCall(1000, () => {
                    if (this.bats && this.bats.getChildren) {
                        this.bats.getChildren().slice().forEach(b => {
                            if (b && b.active) {
                                if (typeof b.takeDamage === 'function') b.takeDamage(9999);
                                else { try { b.destroy(); } catch (e) {} }
                            }
                        });
                    }
                    if (this._sz4BatNests) {
                        // (用户) 100% 清场: 必须遍历副本 — nest.destroy() 会从原数组 splice 自己,
                        // 直接 forEach 原数组会隔一个跳一个, 导致约一半巢逃过清场
                        this._sz4BatNests.slice().forEach(n => {
                            if (n.stopSummoning) n.stopSummoning();
                            if (n.destroy) { try { n.destroy(); } catch (e) {} }
                        });
                        this._sz4BatNests = [];
                    }
                    // boss 坠机: 开重力下落, update 里检测撞 cavetilewall 落地
                    if (boss && boss.sprite && boss.sprite.body) {
                        // (用户) 坠机不再播死亡动画 — 保持咆哮定格的末帧姿态下坠
                        boss.sprite.body.setAllowGravity(true);
                        boss.sprite.body.setVelocity(0, 100);
                        this._batBossCrashing = true;
                        // 5s 保底: 万一卡住没落地, 强制结算
                        this._batBossCrashGuard = this.time.delayedCall(5000, () => {
                            if (this._batBossCrashing) { this._batBossCrashing = false; this._sz4BossLanded(boss.x, boss.y); }
                        });
                    } else {
                        this._sz4BossLanded(lx, ly);
                    }
                });
            });
        }

        // 继承 Tutorial 状态
        this._applyInheritedState();
        if (typeof SaveSystem !== 'undefined') SaveSystem.autoSave(this);   // 进入区域自动存档

        // 进入剧情过渡
        this._cinematicLock = true;
        this.cameras.main.fadeIn(800);
        this.time.delayedCall(900, () => {
            this._cinematicLock = false;
        });
        // (用户) 兜底: 解锁用的是场景时钟, 进场窗口期时钟若被暂停 (guide 弹窗等) 回调会冻住 → 键盘永久失灵.
        //   DOM 计时器不受场景时钟影响, 2 秒后强制解锁
        setTimeout(() => { try { if (this._cinematicLock) this._cinematicLock = false; } catch (e) {} }, 2000);
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

        // Boss update (区2剧情唤醒前 boss 挂天花板不跑 AI)
        if (this._bosses && this._batBossAwake) {
            this._bosses.forEach(b => { if (b && b.update) b.update(time, delta, this.player); });
        }

        // boss 坠机落地检测 (死亡咆哮后开重力下落, 撞到 cavetilewall 即落地 → 掉落 + 水晶扩散)
        if (this._batBossCrashing && this._batBoss && this._batBoss.sprite && this._batBoss.sprite.body) {
            const bb = this._batBoss.sprite.body;
            if (bb.blocked.down || bb.touching.down) {
                this._batBossCrashing = false;
                if (this._batBossCrashGuard) { try { this._batBossCrashGuard.remove(); } catch (e) {} this._batBossCrashGuard = null; }
                this._sz4BossLanded(this._batBoss.x, this._batBoss.y);
            }
        }

        // (用户) 每帧追踪玩家是否在 boss 房内 (玩家墙边沿重建用)
        {
            const _pr4 = this.player, _Gt = 32;
            this._sz4InBossRoomNow = (_pr4 && _pr4.body)
                ? !(_pr4.x < -10 * _Gt || _pr4.x > 13 * _Gt || _pr4.y < -3 * _Gt || _pr4.y > 24 * _Gt)
                : false;
        }
        // === SZ4 boss 房封门 (玩家越过 x=-10 = col -10 触发, 镜像 SZ2 boss 房) ===
        // 怪物墙: 首次触发即建并永久保留 (挡 BatBoss + 所有怪物群); 玩家墙: 死亡移除, 复活重新经过 x=-10 重建
        if (this.player && this.player.body && this.player.x >= -10 * 32 && !this._batBossDead) {
            const bx = -12 * 32 + 32, by = 12 * 32 + 4 * 32, bw = 2 * 32, bh = 8 * 32;  // cols -12..-11, rows 12..19
            if (!this._sz4MobWall) {  // 永久怪物墙 (只建一次, 死亡/复活都不毁)
                const mw = this.add.rectangle(bx, by, bw, bh, 0x000000, 0);
                this.physics.add.existing(mw, true);
                [this.spiders, this.bungeeSpiders, this.bats, this.earthworms,
                 this.slimes, this.beetles, this.mimicOres, this.volatileCrystals].forEach(g => {
                    if (g) this.physics.add.collider(g, mw);
                });
                if (this._batBoss && this._batBoss.sprite) this.physics.add.collider(this._batBoss.sprite, mw);
                if (this.uiCam) { try { this.uiCam.ignore(mw); } catch(e) {} }
                this._sz4MobWall = mw;
                this._registerPickBlocker(mw);  // 稿子对空气墙 = 真墙 (CCD + 碰撞器)
            }
            // (用户) 玩家墙只在"房外→房内"的瞬间重建 — 旧版条件"只要 x>=-10 就建",
            //   而复活点 (19.5,17) 满足 x>=-10, 复活当帧墙秒回来 = 看起来根本没消失.
            //   房界沿用 zone2 出界判定: x -10..13, y -3..24 (格).
            if (!this._sz4PlayerWall && !this.isDead && this._sz4InBossRoomNow && !this._sz4WasInBossRoom) {
                const pw = this.add.rectangle(bx, by, bw, bh, 0x000000, 0);
                this.physics.add.existing(pw, true);
                this.physics.add.collider(this.player, pw);
                if (this.uiCam) { try { this.uiCam.ignore(pw); } catch(e) {} }
                this._sz4PlayerWall = pw;
                this._registerPickBlocker(pw);   // (用户) 挡玩家空气墙也挡稿子
            }
            // (用户) 进区2 → 解锁 Thorns guide (走过荆棘扣血 + 加侵蚀度)
            if (this.guideSystem && this.guideSystem.registerGuide) {
                this.guideSystem.registerGuide({
                    id: 'thorn',
                    title: 'Thorns',
                    animType: 'thorn',
                    captionText: 'Thorns hurt! Walking through them drains HP every second and adds Corrosion. Watch your step.'
                });
            }
            // 首次进 boss 房 → 播放区2进场剧情 (剧情结束才激活 boss)
            // 死亡复活后再进 → 不重播剧情, 直接重新激活 boss
            if (!this._sz4CutsceneStarted) {
                this._sz4CutsceneStarted = true;
                this._startSz4Cutscene();
            } else if (this._sz4CutsceneDone && !this._sz4BossActive) {
                this._sz4BossActive = true;
                this._batBossAwake = true;
                if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_BatBossFight');  // (用户) 再入 boss 房 → 战斗 BGM
                if (this._batBoss) this._batBoss._attackEnabled = true;
                if (this._sz4BatNests) this._sz4BatNests.forEach(n => { if (n.startSummoning) n.startSummoning(); });
            }
        }
        if (!this.isDead) this._sz4WasInBossRoom = this._sz4InBossRoomNow;   // (用户) 死亡期间冻结, 复活在线内也不秒建
        // 玩家死亡 → 移除玩家墙 (保留永久怪物墙) + 停 zone2 攻击 + boss 回 idle; 复活后重新走进 boss 房才重建玩家墙
        if (this.isDead) {
            if (this._sz4BossActive && typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_SafeZone4');  // 死亡 → 退回区域 BGM
            if (this._sz4PlayerWall) {
                if (this._pickExtraWalls) { const i = this._pickExtraWalls.indexOf(this._sz4PlayerWall); if (i >= 0) this._pickExtraWalls.splice(i, 1); }
                this._sz4PlayerWall.destroy(); this._sz4PlayerWall = null;
            }
            if (this._sz4BossActive) {
                this._sz4BossActive = false;
                if (this._batBoss) {
                    this._batBoss._attackEnabled = false;
                    if (this._batBoss._setState) this._batBoss._setState('idle');
                    if (this._batBoss._clearSkillFx) this._batBoss._clearSkillFx();  // 清风环/红光/咆哮圈残留贴图
                }
                if (this._sz4BatNests) this._sz4BatNests.forEach(n => { if (n.stopSummoning) n.stopSummoning(); });
            }
        }
        // 钟乳石下落 (BatBoss 咆哮掉的) + 荆棘 (碰到扣血) — 空数组时无开销
        if (this._stalactites) this._stalactites.forEach(s => s.update());
        if (this._thorns)      this._thorns.forEach(t => t.update());
        // Sign update
        if (this._storySigns) {
            this._storySigns.forEach(s => s.update());
        }

        // SafeZone4 是终点，不传送出去
        // (Spider Queen 死后 RankingSystem 自动显示)

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

            // (用户) 区2边界穿墙保险: 战斗中玩家中心越过边界墙(左列-11/上行-4/右列13)或跌穿地面
            // → 回溯到穿墙前记录的最后合法位置 (即最靠近穿墙点的安全点)
            if (this._sz4BossActive && this.player && this.player.body) {
                const G4 = 32;
                const _px = this.player.body.center.x, _py = this.player.body.center.y;
                const _out = (_px < -10 * G4 || _px > 13 * G4 || _py < -3 * G4 || _py > 24 * G4);
                if (!_out) { this._sz4InX = this.player.x; this._sz4InY = this.player.y; }
                else if (this._sz4InX !== undefined) {
                    this.player.body.reset(this._sz4InX, this._sz4InY);
                }
            }
            // 区2进场剧情走路: 在 movementSystem 之后跑 (覆盖 cinematic 清零的 velocityX)
            // (用户) 剧情绝对接管 — 每帧重申: 高速冲入时任何残余/迟到的冲刺·抓钩·近战与外来速度当帧清除,
            //   玩家移动权 100% 归剧情走位 (cancelDash 不清速度 + 单次入场清理拦不住后续灌入, 故每帧执法)
            if (this._sz4CutsceneActive && this.player && this.player.body) {
                if (this.isDashing && this.dashSystem && this.dashSystem.cancelDash) this.dashSystem.cancelDash();
                if (this.isMeleeAttacking && this.meleeSystem && this.meleeSystem.cancelMelee) this.meleeSystem.cancelMelee();
                if ((this.isGrappling || this.isHanging) && this.grappleSystem && this.grappleSystem.stopGrapple) this.grappleSystem.stopGrapple();
                if (this._sz4CutPhase !== 'walk') {
                    this.player.body.setVelocity(0, 0);   // 非走路阶段: 完全静止 (走路阶段由 _updateSz4Cutscene 独家给速)
                } else {
                    this.player.body.setVelocityX(0);     // 走路阶段: 先清外来 X, 下一行剧情走位重新给 ±150
                }
            }
            if (this._sz4CutsceneActive) this._updateSz4Cutscene(time, delta);
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
        if (!this._cinematicLock) this._updateChunkCamera();   // 剧情期间镜头由 cinematic 接管
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
    }

    _updateYellowDirtSpread(delta) {
        const sp = this._yellowDirtSpread;
        if (!sp || !sp.active) return;
        sp.radius += (delta / 1000) * 5 * 32;
        const r2 = sp.radius * sp.radius;
        const z2 = this._chunks.find(c => c.id === 'zone2');
        if (!z2) return;   // 重置后无 zone2 (单镜头区) — 黄土扩散功能已停用
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

    // ============ 区2 (boss 房) 进场剧情 ============
    _startSz4Cutscene() {
        this._sz4CutsceneActive = true;
        this._cinematicLock = true;
        this._sz4CutPhase = 'walk';
        this._sz4PanGuard = false;

        // (用户) 入场硬停三连: 高速冲刺撞进触发器时, 在飞冲刺会继续灌速度把玩家带出强制走位范围
        //   (死亡路径同款原语) — 撤冲/撤攻/收钩后再清速度, 走位阶段才真正接管
        if (this.dashSystem && this.dashSystem.cancelDash) this.dashSystem.cancelDash();
        if (this.meleeSystem && this.meleeSystem.cancelMelee) this.meleeSystem.cancelMelee();
        if (this.grappleSystem && this.grappleSystem.stopGrapple && (this.isGrappling || this.isHanging)) this.grappleSystem.stopGrapple();

        // 停玩家 + idle
        if (this.player && this.player.body) {
            this.player.body.setVelocity(0, 0);
            if (this.anims.exists('idle')) this.player.play('idle', true);
        }
        // 隐 HUD
        if (this.hudSystem && this.hudSystem.setHUDVisible) this.hudSystem.setHUDVisible(false);

        // 镜头: 放大特写 + 跟随玩家上半身 (zoom 参考 tutorial 大特写)
        const cam = this.cameras.main;
        cam.stopFollow();
        cam.setBounds(-99999, -99999, 199998, 199998);
        cam.zoomTo(2.6, 800, 'Cubic.easeInOut');
        cam.startFollow(this.player, true, 0.12, 0.12);
        cam.setFollowOffset(0, 28);   // 焦点上移到头部 (可调)
    }

    // 走路阶段 (每帧, 在 movementSystem 之后调) — 缓慢走到 (-9,18)
    _updateSz4Cutscene(time, delta) {
        // (用户) 过场中死亡 → 中止并复位旗标, 复活后再进房重播 (否则 Started 卡死, 房间永久失效)
        if (this.healthSystem && this.healthSystem.hp <= 0) {
            this._sz4CutsceneActive = false;
            this._sz4CutsceneStarted = false;
            this._cinematicLock = false;
            const _cam = this.cameras.main;
            _cam.zoomTo(1, 400, 'Cubic.easeInOut');
            _cam.setFollowOffset(0, 0);
            if (this.hudSystem && this.hudSystem.setHUDVisible) this.hudSystem.setHUDVisible(true);
            return;
        }
        if (this._sz4CutPhase !== 'walk') return;
        const G = 32;
        const targetX = -9 * G + G / 2;
        const dx = targetX - this.player.x;
        if (Math.abs(dx) <= 5) {
            if (this.player.body) this.player.body.setVelocityX(0);
            if (this.anims.exists('idle')) this.player.play('idle', true);
            this._sz4CutPhase = 'strike';
            this._sz4CutStrike();
            return;
        }
        const dir = dx > 0 ? 1 : -1;
        if (this.player.body) this.player.body.setVelocityX(dir * 150);   // 缓慢走路
        this.player.setFlipX(dir < 0);
        if (this.anims.exists('run')) this.player.play('run', true);
    }

    // 敲 3 下破坏水晶 (CrystalBlock.takeHit 闪红, hp:10 → 第3下破) + 拾取
    _sz4CutStrike() {
        const crystal = this._sz4CutsceneCrystal;
        this.player.setFlipX(false);   // 面向水晶 (在右边 -8)
        const hit = () => {
            if (this.anims.exists('melee_attack')) {
                this.player.play('melee_attack', true);   // (用户) 打水晶动画 (3帧/20fps ≈ 150ms)
                // (用户) 每打完一下恢复站立, 再打再站
                this.player.once('animationcomplete-melee_attack', () => {
                    if (this.anims.exists('idle')) this.player.play('idle', true);
                });
            }
            if (crystal && !crystal.destroyed && crystal.takeHit) {
                crystal.takeHit(4);
                if (this.meleeSystem) this.meleeSystem._swingHit = true;   // (用户) 有反应 → 实打实音
            }
        };
        // (用户) 靠近后先等 1 秒, 然后每 0.5 秒打 1 下 (第3下破坏 → CrystalBlock._destroy 自动掉落水晶, 玩家就地拾取)
        this.time.delayedCall(1000, hit);
        this.time.delayedCall(1500, hit);
        this.time.delayedCall(2000, hit);
        this.time.delayedCall(2450, () => {
            if (this.anims.exists('idle')) this.player.play('idle', true);
            this._sz4CutScreech();
        });
    }

    // 对话 "..." / "*尖锐叫声*" + 2 秒强震
    _sz4CutScreech() {
        const cam = this.cameras.main;
        if (!this.dialogSystem) {
            cam.shake(2000, 0.015);
            this.time.delayedCall(2000, () => this._sz4CutPanToBoss());
            return;
        }
        this.dialogSystem.showSequence([
            { speaker: '', text: '...' },
            { speaker: '', text: '*A piercing screech tears through the cavern...*',
              onShow: () => { cam.shake(2000, 0.015); } }
        ], () => { this._sz4CutPanToBoss(); });
    }

    // 镜头上移给到 boss (1,-1) — 受 zone2 镜头边界影响, 不一定精准对准
    _sz4CutPanToBoss() {
        const cam = this.cameras.main;
        cam.stopFollow();   // 停跟随玩家, 否则 pan 会被 follow 每帧拉回
        const boss = this._batBoss;
        const bx = boss ? boss.x : (1 * 32 + 16);
        const by = boss ? boss.y : (-1 * 32 + 16);
        cam.pan(bx, by + 32, 1100, 'Cubic.easeInOut', false, (camera, progress) => {   // (用户) 镜头中心下移 1 格
            if (progress < 1 || this._sz4PanGuard) return;
            this._sz4PanGuard = true;
            this._sz4CutWakeBoss();
        });
    }

    // boss 醒来: 播 fly 动画 + 从 (1,-1) 飞到 (1,1) — (用户) 修正: 之前误写 (-1,2) 导致往左下角飞
    _sz4CutWakeBoss() {
        const boss = this._batBoss;
        if (!boss || !boss.sprite) { this._sz4CutBanner(); return; }
        const G = 32;
        this.cameras.main.shake(600, 0.006);
        // 动态 body 会每帧把 sprite 拉回 → tween 期间关 body, 完成后同步 + 重开
        if (boss.sprite.body) boss.sprite.body.enable = false;
        // (用户) 先播 Bat_boss_wakes_up 苏醒动画 (15帧 ~1.25s), 播完才起飞; 缺动画直接起飞
        let _flyStarted = false;
        const _startFly = () => {
            if (_flyStarted || !boss.sprite || !boss.sprite.active) return;
            _flyStarted = true;
            // (用户) 新 boss 皮优先 bat_boss_fly (在 144×112 皮上播小蝙蝠 bat_fly 会把 boss 缩成小只)
            if (this.anims.exists('bat_boss_fly') && boss.sprite.texture && String(boss.sprite.texture.key).startsWith('Bat_boss')) {
                boss.sprite.play('bat_boss_fly', true);
            } else if (this.anims.exists('bat_fly')) boss.sprite.play('bat_fly', true);
            this.tweens.add({
                targets: boss.sprite,
                x: 1 * G + G / 2, y: 1 * G + G / 2,
                duration: 1200,
                ease: 'Cubic.easeInOut',
                onComplete: () => {
                    if (boss.sprite.body) {
                        boss.sprite.body.enable = true;
                        if (boss.sprite.body.reset) boss.sprite.body.reset(boss.sprite.x, boss.sprite.y);
                        boss.sprite.body.setVelocity(0, 0);
                        if (boss.sprite.body.setAllowGravity) boss.sprite.body.setAllowGravity(false);
                    }
                    this._sz4CutShockwave(() => this._sz4CutBanner());
                }
            });
        };
        if (this.anims.exists('bat_boss_wakes_up') && boss.sprite.texture && String(boss.sprite.texture.key).startsWith('Bat_boss')) {
            boss.sprite.play('bat_boss_wakes_up');
            boss.sprite.once('animationcomplete-bat_boss_wakes_up', _startFly);
            this.time.delayedCall(2000, _startFly);   // 兜底 (切后台等动画事件丢失时)
        } else {
            _startFly();
        }
    }

    // (用户) 飞到 (1,1) 后释放冲击波咆哮: 3 个风环 (每秒 1 个, 与实战 wind 同款视觉, 纯展示无击退)
    // 最后一个释放后等 3 秒 (bat_fly 动画继续播) → 进 banner
    _sz4CutShockwave(onDone) {
        const boss = this._batBoss;
        if (!boss || !boss.sprite) { if (onDone) onDone(); return; }
        const G = 32;
        const RING_SPEED = boss.RING_SPEED || 10 * G;
        const maxR = 20 * G;
        const rings = [];
        let spawned = 0;
        const spawnRing = () => {
            if (!boss.sprite || !boss.sprite.scene) return;
            if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this, Math.random() < 0.5 ? 'ForceWingsFlap' : 'ForceWingsFlap2');   // (用户) 冲击波音效 — 真战同款 2选1
            const g = this.add.circle(boss.sprite.x, boss.sprite.y, 8, 0x66ccff, 0).setStrokeStyle(3, 0x88ddff, 0.9).setDepth(19);
            if (this.uiCam) { try { this.uiCam.ignore(g); } catch (e) {} }
            rings.push({ g, r: 8 });
            spawned++;
        };
        // (用户) 剧情咆哮: 飞到 (1,1) 释放冲击波期间循环 Bat_boss_roar
        if (this.anims.exists('bat_boss_roar') && boss.sprite.texture && String(boss.sprite.texture.key).startsWith('Bat_boss')) {
            boss.sprite.play({ key: 'bat_boss_roar', repeat: -1 });
        }
        // (用户) 咆哮声循环 (Bat_Scream) — 贯穿整个咆哮, 回 fly 时停
        let roarSnd = null;
        if (this.cache.audio.exists('Bat_Scream')) {
            try {
                roarSnd = this.sound.add('Bat_Scream', { loop: true, volume: (typeof AudioSystem !== 'undefined' ? AudioSystem.sfxVolume : 0.8) });
                roarSnd.play();
            } catch (e) { roarSnd = null; }
        }
        const stopRoar = () => { if (roarSnd) { try { roarSnd.stop(); roarSnd.destroy(); } catch (e) {} roarSnd = null; } };
        this.events.once('shutdown', stopRoar);
        this.cameras.main.shake(2400, 0.01);   // 咆哮震屏贯穿 3 环释放
        spawnRing();
        this.time.delayedCall(1000, spawnRing);
        this.time.delayedCall(2000, () => {
            spawnRing();   // 最后一个冲击波
            this.time.delayedCall(1500, () => {
                // (用户) 剧情咆哮结束 → 回 fly
                stopRoar();   // (用户) 咆哮完成 → 吼声止
                if (boss.sprite && boss.sprite.active && this.anims.exists('bat_boss_fly')
                    && boss.sprite.anims && boss.sprite.anims.currentAnim && boss.sprite.anims.currentAnim.key === 'bat_boss_roar') {
                    boss.sprite.play('bat_boss_fly', true);
                }
                if (onDone) onDone();
            });   // (用户) 释放后等 1.5 秒 (原 3s 减 1.5s)
        });
        // 扩散 ticker (纯视觉, 不带击退) — 3 环全消散后自停
        const ev = this.time.addEvent({ delay: 16, loop: true, callback: () => {
            for (let i = rings.length - 1; i >= 0; i--) {
                const ring = rings[i];
                if (!ring.g || !ring.g.scene) { rings.splice(i, 1); continue; }
                ring.r += RING_SPEED * (16 / 1000);
                ring.g.setRadius(ring.r);
                ring.g.setStrokeStyle(3, 0x88ddff, Math.max(0, 0.9 * (1 - ring.r / maxR)));
                if (ring.r >= maxR) { try { ring.g.destroy(); } catch (e) {} rings.splice(i, 1); }
            }
            if (spawned >= 3 && rings.length === 0) { try { ev.remove(); } catch (e) {} }
        } });
    }

    _sz4CutBanner() {
        this._showBatBossBanner(() => this._sz4CutRelease());
    }

    // 蝙蝠 boss 进场 banner (仿 SZ2 _showBossBanner, 换蝙蝠头像 + 名字)
    _showBatBossBanner(onDone) {
        const cam = this.cameras.main;
        const W = cam.width, H = cam.height;
        const container = this.add.container(-W, H / 2).setScrollFactor(0).setDepth(999).setScale(2.5);
        // (用户) Banner 重做: 双层紫框 + BOSS 顶标 + 名字底线
        const bg = this.add.rectangle(0, 0, 520, 220, 0x0b0b12, 0.96).setStrokeStyle(3, 0x6a4a99);
        const inner = this.add.rectangle(0, 0, 508, 208, 0x000000, 0).setStrokeStyle(1, 0xaa88ee, 0.35);
        const bossLabel = this.add.text(60, -78, '\u2014 BOSS \u2014', {
            fontSize: '16px', color: '#cfa8ff', fontFamily: '"VT323", monospace', resolution: 2
        }).setOrigin(0.5);
        const portraitBg = this.add.rectangle(-150, 0, 140, 140, 0x1c1828, 1).setStrokeStyle(2, 0x6a4a99);
        const portraitAccent = this.add.rectangle(-150 - 68, 0, 4, 140, 0xaa88ee, 1);   // 紫侧条
        const items = [portraitBg, portraitAccent];
        if (this.textures.exists('Bat_boss_avatar')) {
            // (用户) 专属头像 Bat_boss_avatar 144×112 — 等比 ×0.9 (129.6×100.8) 放进 140 框, 不拉伸
            items.push(this.add.image(-150, 0, 'Bat_boss_avatar').setScale(0.9));
        } else {
            const ptex = this.textures.exists('Bat_attack') ? 'Bat_attack'
                       : (this.textures.exists('Bat_fly') ? 'Bat_fly' : null);
            if (ptex) {
                items.push(this.add.image(-150, 0, ptex).setDisplaySize(120, 120));
            } else {
                const x1 = this.add.rectangle(-150, 0, 100, 4, 0x444444); x1.angle = 45;
                const x2 = this.add.rectangle(-150, 0, 100, 4, 0x444444); x2.angle = -45;
                items.push(x1, x2);
            }
        }
        const nameText = this.add.text(60, 0, 'BROODMOTHER', {
            fontSize: '40px', color: '#ffffff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 5, resolution: 2
        }).setOrigin(0.5);
        // (用户) 横线与菱形按名字实际宽度对齐
        const underline = this.add.rectangle(60, 30, nameText.width + 12, 3, 0xaa88ee, 0.9);
        const dOff = nameText.width / 2 + 11;   // (用户) 菱形再贴近一半 (22 → 11)
        const dL = this.add.text(60 - dOff, 0, '\u25C6', { fontSize: '20px', color: '#cfa8ff', fontFamily: '"VT323", monospace', resolution: 2 }).setOrigin(0.5);
        const dR = this.add.text(60 + dOff, 0, '\u25C6', { fontSize: '20px', color: '#cfa8ff', fontFamily: '"VT323", monospace', resolution: 2 }).setOrigin(0.5);
        container.add([bg, inner, bossLabel, ...items, nameText, underline, dL, dR]);
        this.time.delayedCall(20, () => {
            if (this.cameras.main && container.scene) { try { this.cameras.main.ignore(container); } catch(e) {} }
        });
        this.tweens.add({
            targets: container, x: W / 2, duration: 350, ease: 'Back.easeOut',
            onComplete: () => {
                this.time.delayedCall(900, () => {
                    this.tweens.add({
                        targets: container, x: W * 2, duration: 300, ease: 'Back.easeIn',
                        onComplete: () => { container.destroy(); if (onDone) onDone(); }
                    });
                });
            }
        });
    }

    // 剧情结束: 镜头复位 + 解锁 + 激活 boss 战斗
    _sz4CutRelease() {
        const cam = this.cameras.main;
        const boss = this._batBoss;
        // 镜头平滑回玩家 + zoom 回 2 (避免从 boss 中心硬切)
        cam.pan(this.player.x, this.player.y, 600, 'Cubic.easeInOut');
        cam.zoomTo(2, 600, 'Cubic.easeInOut');
        this.time.delayedCall(640, () => {
            cam.stopFollow();
            cam.setFollowOffset(0, 0);
            this._currentChunkId = null;     // 强制 _updateChunkCamera 重设 bounds
            this._updateChunkCamera();
            cam.startFollow(this.player, true, 0.1, 0.1);
            // 解锁
            this._cinematicLock = false;
            this._sz4CutsceneActive = false;
            this._sz4CutsceneDone = true;
            this._sz4CutPhase = null;
            // (用户) 剧情完成自动存档已拆除 — 存档只发生在进区那一次与检查点; 剧情旗标随下一次存档落盘
            if (this.hudSystem && this.hudSystem.setHUDVisible) this.hudSystem.setHUDVisible(true);
            // 激活 boss 战斗
            this._batBossAwake = true;
            this._sz4BossActive = true;
            if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_BatBossFight');  // (用户) 剧情结束 → 蝙蝠战 BGM
            if (boss) {
                boss._attackEnabled = true;
                if (boss._setState) boss._setState('idle');
                const bw = boss._hpBarW || 120;
                if (boss._hpBg)  { boss._hpBg.setPosition(boss.x - bw / 2, boss.y - 60); boss._hpBg.setVisible(true); }
                if (boss._hpBar) { boss._hpBar.setPosition(boss.x - bw / 2, boss.y - 60); boss._hpBar.setVisible(true); }
            }
            // (用户) batnest 只在介绍布结束后才启动 (剧情期间不生蝙蝠)
            if (this._sz4BatNests) this._sz4BatNests.forEach(n => { if (n.startSummoning) n.startSummoning(); });
        });
    }

    // boss 坠机落地 → Golem 同款掉落 (15 水晶, 自动落地散开别穿模) + 残骸渐隐 + 落地点水晶扩散
    _sz4BossLanded(lx, ly) {
        if (this._batBossLanded) return;
        this._batBossLanded = true;
        const boss = this._batBoss;
        // Golem 同款掉落: 15 颗水晶 (复用 monster_killed 自动落地散开逻辑)
        for (let i = 0; i < 15; i++) {
            try { this.events.emit('monster_killed', lx, ly, 1.0); } catch (e) {}
        }
        // (用户) 落地瞬间播 Bat_boss_dead (31帧), 播完即消失; 缺动画回退渐隐
        if (boss && boss.sprite) {
            if (boss.sprite.body) { try { boss.sprite.body.setVelocity(0, 0); boss.sprite.body.setAllowGravity(false); } catch (e) {} }
            if (this.anims.exists('bat_boss_dead')) {
                boss.sprite.play('bat_boss_dead');
                boss.sprite.once('animationcomplete-bat_boss_dead', () => { try { boss.sprite.destroy(); } catch (e) {} });
                this.time.delayedCall(3200, () => { try { if (boss.sprite && boss.sprite.active) boss.sprite.destroy(); } catch (e) {} });   // 兜底
            } else {
                this.tweens.add({
                    targets: boss.sprite, alpha: 0, duration: 1200, delay: 400,
                    onComplete: () => { try { boss.sprite.destroy(); } catch (e) {} }
                });
            }
        }
        // 落地点 3 格半径 cavetilewall 边 (上/左/右, 不含下) 从中心扩散生成 crystalblock
        this._sz4SpreadDeathCrystals(lx, ly);
    }

    // 落地点附近 cavetilewall 的 上/左/右 空气格生成 crystalblock, 从中心向外错开生成, 跳过有障碍(墙/荆棘/已有方块)的格
    _sz4SpreadDeathCrystals(lx, ly) {
        if (typeof CrystalBlock === 'undefined' || !this.gridSystem) return;
        const G = 32;
        const gs = this.gridSystem;
        const ox = (gs.originX || 0) / G, oy = (gs.originY || 0) / G;   // 世界 cell → grid cell 偏移
        const landCol = Math.floor(lx / G), landRow = Math.floor(ly / G);
        const RADIUS = 3;
        // 荆棘 cell (不在 grid 里, 单独排除)
        const thornCells = new Set();
        if (this._thorns) this._thorns.forEach(t => {
            const tx = (t.x != null) ? t.x : (t.sprite ? t.sprite.x : null);
            const ty = (t.y != null) ? t.y : (t.sprite ? t.sprite.y : null);
            if (tx != null && ty != null) thornCells.add(Math.floor(tx / G) + ',' + Math.floor(ty / G));
        });
        const typeAt = (col, row) => gs.getType(col - ox, row - oy);
        const isWall = (col, row) => typeAt(col, row) === GridSystem.WALL;
        const isAir = (col, row) => (typeAt(col, row) === GridSystem.AIR) && !thornCells.has(col + ',' + row);
        // 收集候选 air 格 (某 wall 的 上/左/右 边, 在半径内)
        const candidates = new Map();   // 'c,r' → {col,row,dist}
        for (let dc = -RADIUS - 1; dc <= RADIUS + 1; dc++) {
            for (let dr = -RADIUS - 1; dr <= RADIUS + 1; dr++) {
                const wc = landCol + dc, wr = landRow + dr;
                if (!isWall(wc, wr)) continue;
                [[0, -1], [-1, 0], [1, 0]].forEach(([ec, er]) => {   // 上 / 左 / 右 (不含下 [0,1])
                    const ac = wc + ec, ar = wr + er;
                    const dist = Math.hypot(ac - landCol, ar - landRow);
                    if (dist > RADIUS + 0.5) return;
                    if (!isAir(ac, ar)) return;
                    const key = ac + ',' + ar;
                    if (!candidates.has(key) || dist < candidates.get(key).dist) candidates.set(key, { col: ac, row: ar, dist });
                });
            }
        }
        // 从中心向外错开生成
        const list = Array.from(candidates.values()).sort((a, b) => a.dist - b.dist);
        list.forEach((c, i) => {
            this.time.delayedCall(i * 90, () => {
                if (typeAt(c.col, c.row) !== GridSystem.AIR) return;   // 期间被占则跳过
                const cb = new CrystalBlock(this, c.col * G + G / 2, c.row * G + G / 2, { hp: 10, dropCount: 1 });
                if (cb.redetectRotation) cb.redetectRotation();
                // (用户) 登记进近战可破坏列表 — 之前漏了这步, 导致死亡水晶打不到(看着像纯贴图)
                if (!this._crystalOres) this._crystalOres = [];
                this._crystalOres.push(cb);
                if (this.uiCam && cb.sprite) { try { this.uiCam.ignore(cb.sprite); } catch (e) {} }
            });
        });
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

        // === 5 cells 在 (32-33, 4-6) — level_1777649865667 ===
        airBg(32, 4, 32, 6);
        airBg(33, 4, 33, 5);

        // === 3 cells 在 (-1~0, 14-15) — level_1777651636433 ===
        airBg(-1, 15, 0, 15);
        airBg(0, 14, 0, 14);

        // === 2 区房间 — level_1777652938312 ===
        airBg(45, 0, 61, 0); airBg(75, 0, 89, 0);
        airBg(44, 1, 89, 1);
        airBg(44, 2, 78, 2); airBg(82, 2, 89, 2);
        airBg(45, 3, 78, 3); airBg(82, 3, 89, 3);
        airBg(58, 4, 67, 4); airBg(71, 4, 89, 4);
        airBg(59, 5, 67, 5); airBg(71, 5, 89, 5);
        airBg(60, 6, 89, 6);
        airBg(60, 7, 73, 7); airBg(77, 7, 85, 7); airBg(89, 7, 89, 7);
        airBg(60, 8, 61, 8); airBg(65, 8, 73, 8); airBg(77, 8, 89, 8);
        airBg(60, 9, 61, 9); airBg(65, 9, 89, 9);
        airBg(59, 10, 82, 10); airBg(86, 10, 89, 10);
        airBg(58, 11, 82, 11); airBg(86, 11, 89, 11);
        airBg(39, 12, 39, 12); airBg(57, 12, 70, 12); airBg(74, 12, 89, 12);
        airBg(39, 13, 40, 13); airBg(56, 13, 70, 13); airBg(74, 13, 89, 13);
        airBg(39, 14, 77, 14); airBg(81, 14, 89, 14);
        airBg(39, 15, 77, 15); airBg(81, 15, 88, 15);
        airBg(39, 16, 63, 16); airBg(67, 16, 87, 16);
        airBg(39, 17, 63, 17); airBg(67, 17, 86, 17);
        airBg(39, 18, 85, 18);
        airBg(39, 19, 83, 19);
        // 2 区柱子 walls
        wallRange(72, 0, 74, 0);
        wallRange(79, 2, 81, 3);
        wallRange(68, 5, 70, 5);
        wallRange(74, 7, 76, 8);
        wallRange(86, 7, 86, 7);
        wallRange(59, 9, 59, 9);
        wallRange(58, 10, 58, 10);
        wallRange(83, 10, 85, 11);
        wallRange(57, 11, 57, 11);
        wallRange(56, 12, 56, 12);
        wallRange(54, 13, 55, 13);
        wallRange(71, 13, 73, 13);
        wallRange(78, 14, 80, 15);
        wallRange(64, 17, 66, 17);

        // === 右侧再扩到 col 93（zone3 右边界）+ 上方 100 格 BG → 用 TileSprite 实现（见下方）===
        // 先 air 让区域可走（不创建独立 BG block 避免上千 image 卡顿）
        airRange(39, -100, 93, -1);
        airRange(90, 0, 93, 22);

        // === level_1777654256180 — 修补 ===
        // walls
        wallRange(-28, 19, -28, 19);
        wallRange(81, 14, 81, 15);
        wallRange(88, 6, 89, 6);
        wallRange(89, 7, 89, 7);
        // bg_block
        airBg(-22, 13, -22, 14);
        airBg(-21, 14, -21, 14);
        airBg(78, 14, 78, 15);
        airBg(86, 7, 87, 7);
        airBg(84, 19, 85, 19);
        airBg(86, 18, 86, 18);
        airBg(87, 17, 87, 17);
        airBg(88, 16, 88, 16);

        // === 远处大块 cavetile 区用 TileSprite（避免上千 wall 卡顿）===
        // 这些区域玩家看到但走不到（被实墙隔离），用 TileSprite 显示纹理即可
        // (90,16) → (93,22) 填满 cavetile wall
        wallRange(90, 16, 93, 22);
        // (90,0) → (93,5) 填满 cavetile wall（顶部）
        wallRange(90, 0, 93, 5);
        // (94,22) 开始往右往上全砍 — 不再创建 col 94+ row<=22 的 wall

        // 远处装饰 TileSprite — 用 Cavetile 纹理（如果存在则用，否则跳过）
        const cavetileTex = this.textures.exists('Cavetile_wall_5LC1') ? 'Cavetile_wall_5LC1' :
                            this.textures.exists('Cavetile_wall_T') ? 'Cavetile_wall_T' : null;
        if (cavetileTex) {
            // 右下：(101, -15) → (139, 30)
            const dec1X = 101 * G;
            const dec1Y = -15 * G;
            const dec1W = (139 - 101 + 1) * G;
            const dec1H = (30 - (-15) + 1) * G;
            const dec1 = this.add.tileSprite(dec1X + dec1W / 2, dec1Y + dec1H / 2, dec1W, dec1H, cavetileTex);
            dec1.setDepth(-5);
            if (this.uiCam) { try { this.uiCam.ignore(dec1); } catch(e) {} }
        }

        // (38,-1) 往右到边界，往上 4 格 — 这是顶部装饰，玩家可走到，保留 wall
        wallRange(38, -4, 139, -1);

        // === level_1777654979306 — 修补 ===
        wallRange(87, 6, 87, 7);
        wallRange(90, 6, 93, 15);
        wallRange(89, 8, 89, 8);
        airBg(89, 9, 89, 9);
        airBg(89, 15, 89, 15);

        // === level_1777716255011 — zone2 内部地形 ===
        // Row 8 全 wall
        wallRange(1, 8, 38, 8);
        // Row 9 全 wall
        wallRange(1, 9, 38, 9);
        // Row 10
        wallRange(1, 10, 8, 10);
        wallRange(31, 10, 38, 10);
        // Row 11
        wallRange(1, 11, 7, 11);
        wallRange(32, 11, 38, 11);
        // Row 12
        wallRange(1, 12, 6, 12);
        wallRange(33, 12, 39, 12);
        // Row 13
        wallRange(1, 13, 5, 13);
        wallRange(34, 13, 40, 13);
        // (1~92, 23~25) 填 cavetile wall
        wallRange(1, 23, 92, 25);

        // === level_1777717223394 — 阶梯地形 ===
        wallRange(0, 14, 5, 14);
        wallRange(6, 13, 6, 13);
        wallRange(7, 12, 7, 12);
        wallRange(8, 11, 8, 11);
        wallRange(9, 10, 9, 10);
        wallRange(30, 10, 30, 10);
        wallRange(31, 11, 31, 11);
        wallRange(32, 12, 32, 12);
        wallRange(33, 13, 33, 13);

        // === level_1777659081310 — 怪物 + 水晶矿 ===
        // 怪物（直接 new，参考 T1 写法）
        // 死亡后随机 1~3 分钟在原位置重生
        // 重生时间到了但玩家不在该 chunk → 等玩家回来才生成
        const pendingRespawns = [];
        this._pendingRespawns = pendingRespawns;
        const scheduleRespawn = (cls, groupName, x, y, homeChunk) => {
            const delay = Phaser.Math.Between(300000, 480000);  // 5~8 分钟
            const readyAt = this.time.now + delay;
            pendingRespawns.push({ cls, groupName, x, y, homeChunk, readyAt });
        };

        const addMon = (m, groupName, classRef, spawnX, spawnY) => {
            const grp = this[groupName];
            if (grp) grp.add(m);
            if (m.setDepth) m.setDepth(10);
            if (this.uiCam) { try { this.uiCam.ignore(m); } catch(e) {} }
            if (groupName === 'bats' && m.body) {
                m.body.setAllowGravity(false);
                m.body.setVelocity(0, 0);
            }
            m._spawnX = spawnX;
            m._spawnY = spawnY;
            m._spawnClass = classRef;
            m._spawnGroupName = groupName;
            const col = m.x / 32, row = m.y / 32;
            let homeChunk = null;
            if (this._chunks) {
                for (const c of this._chunks) {
                    if (col >= c.x1 && col <= c.x2 + 1 && row >= c.y1 && row <= c.y2 + 1) {
                        homeChunk = c;
                        m._homeChunk = c;
                        break;
                    }
                }
            }
            // 监听销毁 → 调度重生
            m.once('destroy', () => {
                scheduleRespawn(classRef, groupName, spawnX, spawnY, homeChunk);
            });
            return m;
        };

        // helper: 创建怪物 at (col, row) + 标记重生信息
        const spawnAt = (cls, groupName, col, row) => {
            const x = col * G + G/2;
            const y = row * G + G/2;
            const m = new cls(this, x, y);
            return addMon(m, groupName, cls, x, y);
        };

        spawnAt(CrystalSlime, 'slimes', 59, 18);
        spawnAt(CrystalSlime, 'slimes', 76, 19);
        spawnAt(CrystalHunterSpider, 'spiders', 72, 11);
        spawnAt(CrystalHunterSpider, 'spiders', 48, 3);
        spawnAt(CrystalHunterSpider, 'spiders', 52, 3);
        spawnAt(CrystalBat, 'bats', 84, 4);
        spawnAt(CrystalBat, 'bats', 70, 1);
        spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 84, -1);

        // === level_1777739054513 — JSON 标记的怪物 spawn (砍一半) ===
        // VolatileCrystal (3 → 2)
        if (typeof VolatileCrystal !== 'undefined') {
            spawnAt(VolatileCrystal, 'volatileCrystals', 16, -26);
            spawnAt(VolatileCrystal, 'volatileCrystals', 52, -38);
        }
        // CrystalBungeeSpider (8 → 4)
        if (typeof CrystalBungeeSpider !== 'undefined') {
            spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 9, -17);
            spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 22, -15);
            spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 66, -40);
            spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 85, -15);
        }
        // CrystalHunterSpider (5 → 3)
        spawnAt(CrystalHunterSpider, 'spiders', 3, -13);
        spawnAt(CrystalHunterSpider, 'spiders', 40, -8);
        spawnAt(CrystalHunterSpider, 'spiders', 90, -19);
        // CrystalBat (12 → 6)
        spawnAt(CrystalBat, 'bats', 9, -34);
        spawnAt(CrystalBat, 'bats', 20, -14);
        spawnAt(CrystalBat, 'bats', 40, -39);
        spawnAt(CrystalBat, 'bats', 49, -32);
        spawnAt(CrystalBat, 'bats', 66, -23);
        spawnAt(CrystalBat, 'bats', 89, -25);
        // HardrockBeetle (4 → 2)
        if (typeof HardrockBeetle !== 'undefined') {
            spawnAt(HardrockBeetle, 'beetles', 9, -6);
            spawnAt(HardrockBeetle, 'beetles', 68, -29);
        }
        // CrystalEarthworm (7 → 3)
        if (typeof CrystalEarthworm !== 'undefined') {
            spawnAt(CrystalEarthworm, 'earthworms', 8, -28);
            spawnAt(CrystalEarthworm, 'earthworms', 47, -9);
            spawnAt(CrystalEarthworm, 'earthworms', 64, -6);
        }
        // CrystalSlime (8 → 4)
        spawnAt(CrystalSlime, 'slimes', 27, -17);
        spawnAt(CrystalSlime, 'slimes', 43, -6);
        spawnAt(CrystalSlime, 'slimes', 73, -33);
        spawnAt(CrystalSlime, 'slimes', 89, -5);

        // 水晶矿
        if (typeof CrystalBlock !== 'undefined') {
            if (!this._crystalOres) this._crystalOres = [];
            const spawnCrystal = (col, row) => {
                const cx = col * G + G / 2;
                const cy = row * G + G / 2;
                const ore = new CrystalBlock(this, cx, cy, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) {
                    try { this.uiCam.ignore(ore.sprite); } catch(e) {}
                }
            };
            spawnCrystal(51, 3);
            spawnCrystal(83, 19);
            spawnCrystal(88, 4);
            spawnCrystal(62, 7);
        }

        // (32, 13~19) — Mob 透明墙（删除原本 33 列）
        for (let row = 13; row <= 19; row++) {
            new MobWall(this, 32 * G + G/2, row * G + G/2, G, G);
        }

        // Checkpoint 神像 — 5 格高 6 格宽，center 在 col 19~20 中间, row 17 中央
        // x = (19 + 20) / 2 = 19.5 → world x = 19.5 * G + G = 640
        // y = 17 * G + G/2 = 560
        this._checkpoint = new Checkpoint(this, 19.5 * G + G/2, 17 * G + G/2 + G/2);

        // 雕像激活后扩散 yellowdirt 皮肤的标记坐标（来自 level_1777717592899）
        this._yellowDirtMarkedCells = [
            [33, 10], [34, 11], [33, 12], [35, 13], [35, 12], [35, 10], [36, 12], [34, 9], [33, 11],
            [33, 20], [33, 21], [33, 22], [34, 21], [35, 20], [36, 22],
            [6, 9], [5, 9], [6, 10], [5, 11], [6, 12], [5, 13], [6, 13], [4, 14],
            [3, 12], [4, 10], [3, 9], [2, 11], [2, 13], [4, 11],
            [6, 21], [6, 22], [5, 22], [5, 20], [4, 21], [2, 20], [3, 22]
        ];
        if (this.uiCam) {
            try { this.uiCam.ignore(this._checkpoint.sprite); } catch(e) {}
            try { this.uiCam.ignore(this._checkpoint.eIcon); } catch(e) {}
        }

        // === level_1777658002927 — 修补 ===
        // walls
        wallRange(75, -1, 75, -1);
        wallRange(85, -1, 86, -1);
        wallRange(72, 0, 74, 0);
        wallRange(86, 0, 89, 0);
        wallRange(88, 1, 89, 1);
        wallRange(89, 2, 89, 5);
        wallRange(88, 5, 88, 5);
        wallRange(88, 8, 88, 8);
        wallRange(89, 9, 89, 9);
        // bg
        airBg(45, -1, 62, -1);
        airBg(76, -1, 84, -1);
        airBg(44, 0, 44, 0);
        airBg(62, 0, 63, 0);
        // platforms (76-84, -2)
        // 先删除这片 wall（之前的 wallRange(38, -4, 139, -1) 把 row -2 也填了）
        airRange(76, -2, 84, -2);
        // 删 col 76~84 row -50 ~ -3 的 wall（让 platform 上方有空间跳上来）
        airRange(76, -50, 84, -3);
        for (let c = 76; c <= 84; c++) {
            if (typeof PlatformBlock !== 'undefined') {
                const p = new PlatformBlock(this, c * G + G / 2, -2 * G + G / 2, G, G);
                if (p.rect && p.rect.body && p.rect.body.updateFromGameObject) {
                    p.rect.body.updateFromGameObject();
                }
                if (p.rect && p.rect.body) {
                    p.rect.body.checkCollision.down = false;
                    p.rect.body.checkCollision.left = false;
                    p.rect.body.checkCollision.right = false;
                    p.rect.body.checkCollision.up = true;
                }
            }
        }
        // platforms (83-86, 6) — 已删除

        // === 大面积 BG（zone4 区域）— 用真实 BG block 填，确保显示 ===
        // 上方扩 BG: (39, -50) → (93, -1) — 缩到 row -50（够看到 zone4）
        bgRange(39, -50, 93, -1);
        // col 32~92 row -52 ~ -3 往上 50 格 BG
        bgRange(32, -52, 92, -3);
        // 右扩 BG: (90, 0) → (93, 22)
        bgRange(90, 0, 93, 22);

        // (32~38, 1~7) cavetile wall
        wallRange(32, 1, 38, 7);

        // === level_1777734198229 — zone4 地形 ===
        // walls
        wallRange(90, -52, 92, -52);
        wallRange(90, -51, 92, -51);
        wallRange(90, -50, 92, -50);
        wallRange(90, -49, 92, -49);
        wallRange(66, -48, 84, -48);
        wallRange(90, -48, 92, -48);
        wallRange(65, -47, 85, -47);
        wallRange(90, -47, 92, -47);
        wallRange(64, -46, 86, -46);
        wallRange(90, -46, 92, -46);
        wallRange(64, -45, 86, -45);
        wallRange(90, -45, 92, -45);
        wallRange(64, -44, 86, -44);
        wallRange(90, -44, 92, -44);
        wallRange(64, -43, 85, -43);
        wallRange(90, -43, 92, -43);
        wallRange(65, -42, 85, -42);
        wallRange(90, -42, 92, -42);
        wallRange(66, -41, 84, -41);
        wallRange(90, -41, 92, -41);
        wallRange(67, -40, 83, -40);
        wallRange(90, -40, 92, -40);
        wallRange(69, -39, 81, -39);
        wallRange(90, -39, 92, -39);
        wallRange(71, -38, 79, -38);
        wallRange(90, -38, 92, -38);
        wallRange(73, -37, 77, -37);
        wallRange(90, -37, 92, -37);
        wallRange(74, -36, 76, -36);
        wallRange(90, -36, 92, -36);
        wallRange(90, -35, 92, -35);
        wallRange(90, -34, 92, -34);
        wallRange(90, -33, 92, -33);
        wallRange(59, -32, 61, -32);
        wallRange(73, -32, 78, -32);
        wallRange(90, -32, 92, -32);
        wallRange(58, -31, 62, -31);
        wallRange(71, -31, 81, -31);
        wallRange(90, -31, 92, -31);
        wallRange(57, -30, 63, -30);
        wallRange(70, -30, 92, -30);
        wallRange(57, -29, 64, -29);
        wallRange(69, -29, 92, -29);
        wallRange(58, -28, 92, -28);
        wallRange(58, -27, 92, -27);
        wallRange(57, -26, 92, -26);
        wallRange(56, -25, 92, -25);
        wallRange(55, -24, 86, -24);
        wallRange(54, -23, 86, -23);
        wallRange(53, -22, 86, -22);
        wallRange(90, -22, 90, -22);
        wallRange(53, -21, 58, -21);
        wallRange(62, -21, 86, -21);
        wallRange(54, -20, 57, -20);
        wallRange(63, -20, 70, -20);
        wallRange(65, -19, 68, -19);
        wallRange(81, -19, 87, -19);
        wallRange(39, -18, 42, -18);
        wallRange(79, -18, 88, -18);
        wallRange(39, -17, 43, -17);
        wallRange(77, -17, 89, -17);
        wallRange(39, -16, 44, -16);
        wallRange(76, -16, 91, -16);
        wallRange(39, -15, 44, -15);
        wallRange(76, -15, 82, -15);
        wallRange(86, -15, 92, -15);
        wallRange(39, -14, 43, -14);
        wallRange(77, -14, 81, -14);
        wallRange(87, -14, 92, -14);
        wallRange(39, -13, 42, -13);
        wallRange(78, -13, 79, -13);
        wallRange(88, -13, 92, -13);
        wallRange(39, -12, 41, -12);
        wallRange(55, -12, 60, -12);
        wallRange(89, -12, 92, -12);
        wallRange(39, -11, 40, -11);
        wallRange(56, -11, 59, -11);
        wallRange(89, -11, 92, -11);
        wallRange(39, -10, 39, -10);
        wallRange(57, -10, 59, -10);
        wallRange(89, -10, 92, -10);
        wallRange(39, -9, 39, -9);
        wallRange(57, -9, 60, -9);
        wallRange(89, -9, 92, -9);
        wallRange(39, -8, 39, -8);
        wallRange(47, -8, 48, -8);
        wallRange(57, -8, 61, -8);
        wallRange(90, -8, 92, -8);
        wallRange(39, -7, 40, -7);
        wallRange(46, -7, 49, -7);
        wallRange(56, -7, 61, -7);
        wallRange(39, -6, 41, -6);
        wallRange(45, -6, 50, -6);
        wallRange(55, -6, 62, -6);
        wallRange(39, -5, 73, -5);
        // air 挖洞
        airRange(87, -42, 87, -42);
        airRange(87, -38, 87, -38);
        airRange(87, -34, 87, -34);
        airRange(89, -33, 89, -33);
        airRange(88, -32, 89, -32);
        airRange(84, -31, 89, -31);
        airRange(62, -20, 62, -20);
        airRange(76, -17, 76, -17);
        airRange(45, -16, 45, -16);
        airRange(66, -16, 70, -16);
        airRange(49, -15, 49, -15);
        airRange(75, -15, 75, -15);
        airRange(76, -14, 76, -14);
        airRange(75, -4, 75, -4);
        airRange(85, -4, 85, -4);
        // platforms (4 行)
        const _zone4Plats = [
            { y: -46, c1: 87, c2: 89 },
            { y: -42, c1: 88, c2: 89 },
            { y: -38, c1: 88, c2: 89 },
            { y: -34, c1: 88, c2: 89 },
        ];
        _zone4Plats.forEach(p => {
            for (let c = p.c1; c <= p.c2; c++) {
                if (typeof PlatformBlock !== 'undefined') {
                    const pb = new PlatformBlock(this, c * G + G/2, p.y * G + G/2, G, G);
                    if (pb.rect && pb.rect.body) {
                        pb.rect.body.checkCollision.down = false;
                        pb.rect.body.checkCollision.left = false;
                        pb.rect.body.checkCollision.right = false;
                        pb.rect.body.checkCollision.up = true;
                        if (pb.rect.body.updateFromGameObject) pb.rect.body.updateFromGameObject();
                    }
                }
            }
        });
        // 水晶矿
        if (typeof CrystalBlock !== 'undefined') {
            if (!this._crystalOres) this._crystalOres = [];
            const _spawnCrystalZone4 = (col, row) => {
                const ore = new CrystalBlock(this, col * G + G/2, row * G + G/2, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) {
                    try { this.uiCam.ignore(ore.sprite); } catch(e) {}
                }
            };
            _spawnCrystalZone4(41, -7);
            _spawnCrystalZone4(44, -6);
            _spawnCrystalZone4(54, -6);
            _spawnCrystalZone4(49, -8);
        }
        // KeyDoor (col 91, row -5 ~ -7) — 3 格高
        if (typeof KeyDoor !== 'undefined') {
            this._zone4KeyDoor = new KeyDoor(
                this,
                91 * G + G/2,
                (-7 + -5 + 1) / 2 * G,
                G,
                3 * G
            );
        }
        // 单独 wall (92, -7) — KeyDoor 旁的装饰墙
        wallRange(92, -7, 92, -7);
        // StoneDoor (col 75, row -35 ~ -33) — 3 格高
        if (typeof StoneDoor !== 'undefined') {
            this._zone4StoneDoor = new StoneDoor(
                this,
                75 * G + G/2,
                (-35 + -33 + 1) / 2 * G,
                G,
                3 * G,
                6
            );
        }

        // === level_1777737194034 — zone4/zone5 地形扩展 ===
        // walls (80 runs)
        wallRange(-6, -36, 25, -36);
        wallRange(-6, -35, 25, -35);
        wallRange(-7, -34, 7, -34);
        wallRange(-7, -33, -2, -33);
        wallRange(1, -33, 5, -33);
        wallRange(-7, -32, -3, -32);
        wallRange(2, -32, 4, -32);
        wallRange(-7, -31, -3, -31);
        wallRange(3, -31, 3, -31);
        wallRange(-7, -30, -4, -30);
        wallRange(-7, -29, -4, -29);
        wallRange(-7, -28, -4, -28);
        wallRange(-7, -27, -4, -27);
        wallRange(7, -27, 13, -27);
        wallRange(-7, -26, -3, -26);
        wallRange(7, -26, 14, -26);
        wallRange(-7, -25, -3, -25);
        wallRange(7, -25, 17, -25);
        wallRange(-7, -24, -3, -24);
        wallRange(6, -24, 18, -24);
        wallRange(91, -24, 92, -24);
        wallRange(-7, -23, -2, -23);
        wallRange(5, -23, 19, -23);
        wallRange(69, -23, 70, -23);
        wallRange(92, -23, 92, -23);
        wallRange(-7, -22, 19, -22);
        wallRange(92, -22, 92, -22);
        wallRange(-7, -21, 19, -21);
        wallRange(92, -21, 92, -21);
        wallRange(-7, -20, 20, -20);
        wallRange(92, -20, 92, -20);
        wallRange(-7, -19, 21, -19);
        wallRange(91, -19, 92, -19);
        wallRange(-7, -18, 1, -18);
        wallRange(5, -18, 9, -18);
        wallRange(13, -18, 22, -18);
        wallRange(29, -18, 38, -18);
        wallRange(89, -18, 92, -18);
        wallRange(-7, -17, 0, -17);
        wallRange(7, -17, 8, -17);
        wallRange(14, -17, 22, -17);
        wallRange(28, -17, 38, -17);
        wallRange(90, -17, 92, -17);
        wallRange(-7, -16, -1, -16);
        wallRange(15, -16, 22, -16);
        wallRange(27, -16, 38, -16);
        wallRange(92, -16, 92, -16);
        wallRange(-7, -15, -1, -15);
        wallRange(16, -15, 21, -15);
        wallRange(27, -15, 38, -15);
        wallRange(-7, -14, 0, -14);
        wallRange(17, -14, 19, -14);
        wallRange(27, -14, 38, -14);
        wallRange(-7, -13, 2, -13);
        wallRange(27, -13, 38, -13);
        wallRange(56, -13, 60, -13);
        wallRange(80, -13, 80, -13);
        wallRange(-7, -12, 5, -12);
        wallRange(27, -12, 38, -12);
        wallRange(-7, -11, 7, -11);
        wallRange(28, -11, 38, -11);
        wallRange(-7, -10, 6, -10);
        wallRange(29, -10, 38, -10);
        wallRange(60, -10, 60, -10);
        wallRange(-7, -9, 5, -9);
        wallRange(30, -9, 38, -9);
        wallRange(61, -9, 61, -9);
        wallRange(-7, -8, 5, -8);
        wallRange(17, -8, 20, -8);
        wallRange(30, -8, 38, -8);
        wallRange(-7, -7, 5, -7);
        wallRange(16, -7, 21, -7);
        wallRange(29, -7, 38, -7);
        wallRange(-7, -6, 6, -6);
        wallRange(15, -6, 22, -6);
        wallRange(28, -6, 38, -6);
        wallRange(-7, -5, -1, -5);
        wallRange(-7, -4, -1, -4);
        wallRange(-7, -3, -1, -3);
        wallRange(-7, -2, -1, -2);
        // air 挖洞 (25 runs)
        airRange(57, -29, 57, -29);
        airRange(6, -26, 6, -26);
        airRange(5, -25, 6, -25);
        airRange(18, -25, 20, -25);
        airRange(78, -25, 89, -25);
        airRange(4, -24, 5, -24);
        airRange(19, -24, 20, -24);
        airRange(77, -24, 86, -24);
        airRange(3, -23, 4, -23);
        airRange(64, -23, 68, -23);
        airRange(76, -23, 86, -23);
        airRange(61, -22, 71, -22);
        airRange(75, -22, 86, -22);
        airRange(90, -22, 90, -22);
        airRange(62, -21, 86, -21);
        airRange(32, -20, 36, -20);
        airRange(63, -20, 70, -20);
        airRange(30, -19, 37, -19);
        airRange(65, -19, 68, -19);
        airRange(87, -19, 87, -19);
        airRange(89, -19, 90, -19);
        airRange(24, -17, 24, -17);
        airRange(54, -13, 55, -13);
        airRange(60, -12, 60, -12);
        airRange(92, -7, 92, -7);
        // bg (22 runs)
        bgRange(2, -18, 4, -18);
        bgRange(10, -18, 12, -18);
        bgRange(1, -17, 6, -17);
        bgRange(9, -17, 13, -17);
        bgRange(0, -16, 14, -16);
        bgRange(0, -15, 15, -15);
        bgRange(22, -15, 26, -15);
        bgRange(1, -14, 16, -14);
        bgRange(20, -14, 26, -14);
        bgRange(3, -13, 26, -13);
        bgRange(6, -12, 25, -12);
        bgRange(8, -11, 27, -11);
        bgRange(7, -10, 28, -10);
        bgRange(6, -9, 29, -9);
        bgRange(6, -8, 16, -8);
        bgRange(21, -8, 29, -8);
        bgRange(6, -7, 15, -7);
        bgRange(22, -7, 28, -7);
        bgRange(7, -6, 14, -6);
        bgRange(23, -6, 27, -6);
        bgRange(8, -5, 13, -5);
        bgRange(24, -5, 26, -5);
        // platforms (2 runs)
        const _zone5Plats = [
            { y: -16, c1: 23, c2: 26 },
            { y: -12, c1: 26, c2: 26 },
        ];
        _zone5Plats.forEach(p => {
            for (let c = p.c1; c <= p.c2; c++) {
                if (typeof PlatformBlock !== 'undefined') {
                    const pb = new PlatformBlock(this, c * G + G/2, p.y * G + G/2, G, G);
                    if (pb.rect && pb.rect.body) {
                        pb.rect.body.checkCollision.down = false;
                        pb.rect.body.checkCollision.left = false;
                        pb.rect.body.checkCollision.right = false;
                        pb.rect.body.checkCollision.up = true;
                        if (pb.rect.body.updateFromGameObject) pb.rect.body.updateFromGameObject();
                    }
                }
            }
        });
        // crystals (2)
        if (typeof CrystalBlock !== 'undefined') {
            if (!this._crystalOres) this._crystalOres = [];
            const _spawnCrystalZone5 = (col, row) => {
                const ore = new CrystalBlock(this, col * G + G/2, row * G + G/2, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) {
                    try { this.uiCam.ignore(ore.sprite); } catch(e) {}
                }
            };
            _spawnCrystalZone5(88, -19);
            _spawnCrystalZone5(91, -20);
        }

        // === level_1777737792323 — zone5 上方阶梯地形 ===
        // zone5 范围全填 bg (-6, -36) → (36, -2)
        bgRange(-6, -36, 36, -2);
        // walls (13)
        wallRange(-7, -37, 36, -37);
        wallRange(-7, -36, -7, -36);
        wallRange(26, -36, 36, -36);
        wallRange(-7, -35, -7, -35);
        wallRange(26, -35, 36, -35);
        wallRange(20, -34, 36, -34);
        wallRange(23, -33, 36, -33);
        wallRange(25, -32, 36, -32);
        wallRange(27, -31, 36, -31);
        wallRange(29, -30, 36, -30);
        wallRange(31, -29, 36, -29);
        wallRange(33, -28, 36, -28);
        wallRange(35, -27, 36, -27);
        // air 挖洞 (5)
        airRange(10, -38, 11, -38);
        airRange(20, -30, 20, -30);
        airRange(1, -29, 1, -29);
        airRange(31, -25, 31, -25);
        airRange(33, -22, 33, -22);

        // === level_1777739054513 — zone6 阶梯 + 散布水晶 ===
        // walls (25)
        wallRange(36, -46, 50, -46);
        wallRange(36, -45, 49, -45);
        wallRange(36, -44, 48, -44);
        wallRange(36, -43, 46, -43);
        wallRange(36, -42, 44, -42);
        wallRange(36, -41, 42, -41);
        wallRange(36, -40, 40, -40);
        wallRange(36, -39, 39, -39);
        wallRange(36, -38, 39, -38);
        wallRange(47, -38, 51, -38);
        wallRange(37, -37, 38, -37);
        wallRange(46, -37, 52, -37);
        wallRange(37, -36, 38, -36);
        wallRange(46, -36, 53, -36);
        wallRange(37, -35, 38, -35);
        wallRange(46, -35, 53, -35);
        wallRange(37, -34, 38, -34);
        wallRange(47, -34, 52, -34);
        wallRange(37, -33, 39, -33);
        wallRange(48, -33, 51, -33);
        wallRange(37, -32, 39, -32);
        wallRange(37, -31, 39, -31);
        wallRange(37, -30, 39, -30);
        wallRange(37, -29, 38, -29);
        wallRange(37, -28, 37, -28);
        // air (7)
        airRange(45, -37, 45, -37);
        airRange(53, -37, 53, -37);
        airRange(75, -34, 75, -34);
        airRange(45, -33, 45, -33);
        airRange(45, -29, 45, -29);
        airRange(42, -26, 42, -26);
        airRange(42, -22, 42, -22);
        // crystals (21)
        if (typeof CrystalBlock !== 'undefined') {
            if (!this._crystalOres) this._crystalOres = [];
            const _spawnCrystalZone6 = (col, row) => {
                const ore = new CrystalBlock(this, col * G + G/2, row * G + G/2, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) {
                    try { this.uiCam.ignore(ore.sprite); } catch(e) {}
                }
            };
            _spawnCrystalZone6(-2, -24);
            _spawnCrystalZone6(1, -23);
            _spawnCrystalZone6(1, -14);
            _spawnCrystalZone6(6, -25);
            _spawnCrystalZone6(7, -6);
            _spawnCrystalZone6(11, -6);
            _spawnCrystalZone6(15, -26);
            _spawnCrystalZone6(15, -7);
            _spawnCrystalZone6(21, -8);
            _spawnCrystalZone6(25, -6);
            _spawnCrystalZone6(28, -7);
            _spawnCrystalZone6(39, -34);
            _spawnCrystalZone6(39, -19);
            _spawnCrystalZone6(48, -39);
            _spawnCrystalZone6(55, -25);
            _spawnCrystalZone6(65, -6);
            _spawnCrystalZone6(67, -29);
            _spawnCrystalZone6(71, -32);
            _spawnCrystalZone6(83, -31);
            _spawnCrystalZone6(86, -31);
            _spawnCrystalZone6(88, -5);
        }

        // === level_1777858207168 — zone6 上方深处地形 ===
        // walls (34)
        wallRange(40, -65, 92, -65);
        wallRange(40, -64, 92, -64);
        wallRange(40, -63, 70, -63);
        wallRange(76, -63, 92, -63);
        wallRange(40, -62, 57, -62);
        wallRange(64, -62, 69, -62);
        wallRange(77, -62, 92, -62);
        wallRange(40, -61, 48, -61);
        wallRange(53, -61, 56, -61);
        wallRange(66, -61, 67, -61);
        wallRange(78, -61, 92, -61);
        wallRange(40, -60, 47, -60);
        wallRange(79, -60, 92, -60);
        wallRange(40, -59, 46, -59);
        wallRange(86, -59, 92, -59);
        wallRange(40, -58, 45, -58);
        wallRange(87, -58, 92, -58);
        wallRange(40, -57, 45, -57);
        wallRange(88, -57, 92, -57);
        wallRange(40, -56, 45, -56);
        wallRange(89, -56, 92, -56);
        wallRange(40, -55, 46, -55);
        wallRange(90, -55, 92, -55);
        wallRange(40, -54, 47, -54);
        wallRange(90, -54, 92, -54);
        wallRange(40, -53, 48, -53);
        wallRange(90, -53, 92, -53);
        wallRange(40, -52, 52, -52);
        wallRange(40, -51, 75, -51);
        wallRange(40, -50, 76, -50);
        wallRange(40, -49, 77, -49);
        wallRange(40, -48, 65, -48);
        wallRange(40, -47, 64, -47);
        wallRange(51, -46, 63, -46);
        // bg (14)
        bgRange(71, -63, 75, -63);
        bgRange(58, -62, 63, -62);
        bgRange(70, -62, 76, -62);
        bgRange(49, -61, 52, -61);
        bgRange(57, -61, 65, -61);
        bgRange(68, -61, 77, -61);
        bgRange(48, -60, 78, -60);
        bgRange(47, -59, 85, -59);
        bgRange(46, -58, 86, -58);
        bgRange(46, -57, 87, -57);
        bgRange(46, -56, 88, -56);
        bgRange(47, -55, 89, -55);
        bgRange(48, -54, 89, -54);
        bgRange(49, -53, 89, -53);

        // (93, -65 ~ 0) cavetile 一列
        wallRange(93, -65, 93, 0);

        // === SafeZone4 — Spider Queen Final Boss ===

        // Clear 关键位置
        airRange(-25, 19, -10, 21);
        airRange(55, -52, 70, -48);   // boss 位置
        bgRange(-25, 19, -10, 21);
        bgRange(55, -52, 70, -48);

        // (StorySign 已删 — 用户要求)

        // Final Boss — Spider Queen (zone6 深处)
        if (typeof SpiderQueenBoss !== 'undefined') {
            this._finalBoss = new SpiderQueenBoss(this, 60 * G, -50 * G);
            this._finalBoss._disableAttack = true;  // 技能待补
            if (!this._bosses) this._bosses = [];
            this._bosses.push(this._finalBoss);
            this.events.on('spider_queen_died', () => {
                this._finalBossDead = true;
                // (用户) 蓝水晶全数转黄 (蓝行隐藏, 黄/guide 上移); 通关统计 = 转换后的黄水晶总量
                if (this.hudSystem && this.hudSystem.convertBlueToYellow) this.hudSystem.convertBlueToYellow();
                this.time.delayedCall(2000, () => {
                    if (!this._rankingSystem && typeof RankingSystem !== 'undefined') {
                        this._rankingSystem = new RankingSystem(this);
                        // (用户) 通关统计 = 转换后的黄水晶总量 (蓝已并入); 旧 crystalSystem 引用无效, 已弃
                        this._rankingSystem.show(this.hudSystem ? (this.hudSystem.yellowCrystalCount || 0) : 0);
                    }
                });
            });
        }

        // === SecretDoor 装饰 已删 (用户要求) ===
    }
}
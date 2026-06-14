// ============================================================
//  SafeZone6Scene — 干净空框架 (从队友同源克隆剥离 boss 竞技场内容得到)
//  保留你全套框架: 玩家/挖矿/铁镐/钩索/近战/怪物/拾取/HUD/相机/输入.
//  无地形 / 背景 / 音乐 / 剧情 / boss — 全部从头设计.
// ============================================================
class SafeZone6Scene extends MainGameScene {
handlePickCollide(pick, id) {
    if (!pick.body) return;
    let dtk = id === 1 ? 'dropTimer1' : 'dropTimer2';
    if (pick.state==='flying_max' || pick.state==='flying_gravity' || pick.state==='dropping') {
        if (pick._lastCX !== undefined) {
            const bcx = pick.body.center.x, bcy = pick.body.center.y;
            if (Math.hypot(bcx - pick._lastCX, bcy - pick._lastCY) <= 400) {   
                let wl = this.wallRects;
                if (this._pickExtraWalls && this._pickExtraWalls.length) {
                    wl = wl.concat(this._pickExtraWalls.filter(w => w && w.body).map(w => w.body));
                }
                const bk = CollisionUtils.sweptSegmentVsWalls(pick._lastCX, pick._lastCY, bcx, bcy, wl, 6);
                if (bk.hit) { pick.body.reset(bk.x, bk.y); pick.x = bk.x; pick.y = bk.y; }
            }
        }
        CollisionUtils.resolvePickWallCollision(pick, this.wallRects);
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
    Phaser.Scene.call(this, { key: 'SafeZone6Scene' });
}

init(data) {
    this._inheritedData = data || {};
}

create() {
    if (typeof AudioSystem !== 'undefined') AudioSystem.stopBGM();  

    this._pickaxeUpgraded = !!this.registry.get('pickaxeUpgraded');
    this.WARNING_DISTANCE = 280; this.HEAVY_FLY_LIMIT = 214; this.CRITICAL_DISTANCE = 380;
    this.activeEnd1 = 14; this.activeEnd2 = 14;
    this._registerMonsterAnims();

    const G = 60;
    const W = 6000;
    const H = 1200;

    this.playerCanMove = true;

    this.cameras.main.setBackgroundColor('#050510');
    this.physics.world.setBounds(0, 0, W, H);


    this._initT1State();
    this.input.mouse.disableContextMenu();
    this._registerAnims();

    this.keyJump   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyJumpW  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);   
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

    const boundsX = 0;
    const boundsY = 0;
    const boundsW = W;
    const boundsH = H;
    this.gridSystem = new GridSystem(this, G, boundsW, boundsH, boundsX, boundsY);

    this.walls = this.physics.add.staticGroup();
    this.platforms = this.physics.add.staticGroup();
    this.bgBlocks = this.physics.add.staticGroup();
    this.crystalBlocks = this.physics.add.staticGroup();
    this.wallRects = [];
    this.droppedCrystals = this.physics.add.group();
    this.spiders = this.physics.add.group();
    this.bungeeSpiders = this.physics.add.group();
    this.bats = this.physics.add.group();
    this.earthworms = this.physics.add.group();
    this.slimes = this.physics.add.group();
    this.beetles = this.physics.add.group();
    this.mimicOres = this.physics.add.group();
    this.volatileCrystals = this.physics.add.group();


    this._applyLevelData();

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

    this.keyZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);

    if (typeof CavetileWall !== 'undefined' && CavetileWall.renderSkins) {
        CavetileWall.renderSkins(this);
    }

    this.ropePhysics   = new RopePhysics(this);
    this.dashSystem    = new DashSystem(this);
    this.movementSystem= new MovementSystem(this);
    this.throwSystem   = new ThrowSystem(this);
    this.grappleSystem = new GrappleSystem(this);
    this.recallSystem  = new RecallSystem(this);
    this.meleeSystem   = new MeleeSystem(this);

    this.player = new Player(this, this.spawnX || 360, this.spawnY || 440);

    this._setupRealPickaxes();

    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.droppedCrystals, this.walls);
    this.physics.add.collider(this.spiders, this.walls);
    this.physics.add.collider(this.bats, this.walls);
    this.physics.add.collider(this.slimes, this.walls);
    this.physics.add.collider(this.beetles, this.walls);
    this.physics.add.collider(this.earthworms, this.walls);
    this.physics.add.collider(this.mimicOres, this.walls);
    this.physics.add.collider(this.bungeeSpiders, this.walls);
    this.physics.add.collider(this.volatileCrystals, this.walls);

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

    if (typeof FogSystem !== 'undefined' && this.gridSystem) {
        const _fg = this.gridSystem;
        this.fogSystem = new FogSystem(this, _fg.cellSize, _fg.cols * _fg.cellSize, _fg.rows * _fg.cellSize, _fg.originX || 0, _fg.originY || 0);
    }

    this.events.on('monster_killed', (mx, my, dropRate) => {
        if (Math.random() <= dropRate) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 5 + Math.random() * 10;
            let targetX = mx + Math.cos(angle) * radius;
            let targetY = my + Math.sin(angle) * radius;
            if (this.wallRects) {
                for (const w of this.wallRects) {
                    if (w.bottom > my - 14 && w.top < my + 14 && targetX > w.left - 10 && targetX < w.right + 10) {
                        targetX = (mx <= (w.left + w.right) / 2) ? w.left - 10 : w.right + 10;
                    }
                }
                let nearestFloorY = Infinity;
                for (const w of this.wallRects) {
                    if (targetX >= w.left && targetX <= w.right && w.top >= my - 4) {
                        if (w.top < nearestFloorY) nearestFloorY = w.top;
                    }
                }
                if (nearestFloorY === Infinity) {
                    targetX = mx; targetY = my;
                } else {
                    targetY = nearestFloorY - 12;
                }
                for (const w of this.wallRects) {
                    if (targetX > w.left - 10 && targetX < w.right + 10 && targetY > w.top - 10 && targetY < w.bottom + 10) {
                        targetX = mx; targetY = my; break;
                    }
                }
            }
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
            this.tweens.add({ targets: c, angle: 360, duration: 350, ease: 'Linear' });
            const peakY = Math.min(my, targetY) - 30;
            this.tweens.add({
                targets: c, y: peakY, duration: 175, ease: 'Quad.easeOut',
                onComplete: () => this.tweens.add({
                    targets: c, y: targetY,
                    duration: Math.max(175, Math.sqrt(2 * Math.max(1, targetY - peakY) / ((this.physics && this.physics.world && this.physics.world.gravity.y) || 1200)) * 1000),
                    ease: 'Quad.easeIn',
                    onComplete: () => { c.angle = 0; }
                })
            });
        }
    });

    this.events.on('slime_split', (x, y) => {
        for (let i = 0; i < 2; i++) {
            const mini = new CrystalSlime(this, x + (i === 0 ? -20 : 20), y - 10, true);
            this.slimes.add(mini);
            if (mini.setDepth) mini.setDepth(10);
            if (this.uiCam) { try { this.uiCam.ignore(mini); } catch(e) {} }
            this.physics.add.collider(mini, this.walls);
        }
    });

    this._chunks = [];
    this._currentChunkId = null;

    this.cameras.main.setZoom(1.8);
    this.cameras.main.startFollow(this.player, true, 0.05, 0.05);

    this.cameraSystem = new CameraSystem(this.cameras.main, this.player);
    this.uiCam = this.cameraSystem.setupUICamera(this);

    try {
        this.cameras.main.ignore(this.crosshair);
        this.cameras.main.ignore(this.leftHandIndicator);
        this.cameras.main.ignore(this.rightHandIndicator);
    } catch(e) {}

    this.time.delayedCall(100, () => {
        if (this.hudSystem && this.hudSystem.displayGroup && typeof this.hudSystem.displayGroup.getChildren === 'function') {
            this.hudSystem.displayGroup.getChildren().forEach(item => {
                item.setScrollFactor(0);
                this.cameras.main.ignore(item);
            });
        }
    });


    const cursorTex = this.textures.exists('Mouse_cursor') ? 'Mouse_cursor' : 'crosshair_custom';
    this.crosshair          = this.add.sprite(0, 0, cursorTex).setDepth(999999).setScrollFactor(0);
    { const _p0 = this.input && this.input.activePointer; if (_p0) this.crosshair.setPosition(_p0.x, _p0.y); }
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

    this._applyInheritedState();
    if (typeof SaveSystem !== 'undefined') SaveSystem.autoSave(this);

    this._cinematicLock = false;
    this.cameras.main.fadeIn(400);
}

_applyInheritedState() {
    const data = this._inheritedData || {};
    if (data.plotFlags) { try { for (const k in data.plotFlags) { if (data.plotFlags[k] === true && !/CutsceneStarted$/.test(k)) this[k] = true; } } catch (e) {} }
    if (typeof data.playMs === 'number') { this._playMsBase = data.playMs; this._playStartAt = Date.now(); }
    if (typeof data.yellowCrystalCount === 'number' && this.hudSystem) {
        this.hudSystem.yellowCrystalCount = data.yellowCrystalCount;
        if (data.yellowCrystalShown) this.hudSystem.yellowCrystalShown = false;
        if (this.hudSystem.addYellowCrystal) this.hudSystem.addYellowCrystal(0);
    }
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
    if (data.hasHealthDetector) {
        this._hasHealthDetector = true;
        if (this.diseaseSystem && this.diseaseSystem.setBarVisible) {
            this.diseaseSystem.setBarVisible(true);
        }
        if (this.hudSystem && this.hudSystem._updateHealthDetectorLayout) {
            this.hudSystem._updateHealthDetectorLayout(true);
        }
    }
    if (typeof data.corrosionPct === 'number' && this.diseaseSystem) {
        this.diseaseSystem.corrosionPct = data.corrosionPct;
        if (this.diseaseSystem._updateUI) this.diseaseSystem._updateUI();
    }
}

_registerAnims() {
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
    safeCreate('dash', 'Miner_dash', { start: 0, end: 3 }, 24, 0);
    safeCreate('melee_attack_slash', 'melee_attack_slash', { start: 0, end: 4 }, 24, 0);

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

    if (this.textures.exists('Mimic_ore_run') && !this.anims.exists('mimic_ore_run')) {
        const total = this.textures.get('Mimic_ore_run').frameTotal - 2;
        this.anims.create({ key: 'mimic_ore_run', frames: this.anims.generateFrameNumbers('Mimic_ore_run', { start: 0, end: total > 0 ? total : 0 }), frameRate: 10, repeat: -1 });
    }

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
    if (this._uiPaused) return;   
    if (!this.player.body) return;

    if (this._hints) this._hints.forEach(h => h.update());
    if (this._chests) this._chests.forEach(c => c.update());
    if (this._crystalNpcs) this._crystalNpcs.forEach(n => n.update());

    let paused = this.shopSystem?.isOpen || this.hudSystem?.gamePausedByConfirm;

    if (this.dashCooldown > 0)  this.dashCooldown  -= delta;
    if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

    let pointer = this.input.activePointer;
    if (this.crosshair) this.crosshair.setPosition(pointer.x, pointer.y);
    if (this.leftHandIndicator) this.leftHandIndicator.setPosition(pointer.x - 22, pointer.y);
    if (this.rightHandIndicator) this.rightHandIndicator.setPosition(pointer.x + 22, pointer.y);

    if (this.crosshair) this.crosshair.setVisible(!this._cssCursorOverlap);   

    if (this.healthSystem) this.healthSystem.update(delta);
    if (this.diseaseSystem) this.diseaseSystem.update(delta);
    if (this.interactSystem) this.interactSystem.update();
    if (this.fogSystem) this.fogSystem.update(this.player.x, this.player.y);

    if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
        if (this._gridGraphics) {
            this._gridGraphics.setVisible(!this._gridGraphics.visible);
        }
    }
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
            const gx = Math.floor(wx / 60);
            const gy = Math.floor(wy / 60);
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

    if (this.playerCanMove) {
        if (!this.isPlayerStunned && this.movementSystem) {
            this.movementSystem.update(time, delta);
            this._updateRealPickaxes(time, delta);
        }
    } else {
        this.player.body.setVelocityX(0);
        this.player.anims.play('idle', true);
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
    this._updateMonstersFiltered(time, delta);
    this._updateChunkCamera();
    this._checkPlatformGuide();
    this._checkPendingRespawns();
    this._checkCheckpoint();
    this._updateYellowDirtSpread(delta);

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
    if (!z2) return;
    const z2x1 = z2.x1 * 32, z2x2 = (z2.x2 + 1) * 32;
    const z2y1 = z2.y1 * 32, z2y2 = (z2.y2 + 1) * 32;
    if (sp.maxRadius == null) {
        const corners = [
            { x: z2x1, y: z2y1 }, { x: z2x2, y: z2y1 },
            { x: z2x1, y: z2y2 }, { x: z2x2, y: z2y2 }
        ];
        sp.maxRadius = Math.max(...corners.map(c => Math.hypot(c.x - sp.cx, c.y - sp.cy)));
    }
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

_checkMeleeOnCrystalOres() {
    if (!this._crystalOres || !this.player) return;
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
        if (this.meleeSystem) this.meleeSystem._swingHit = true;   
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
        if (now < r.readyAt) continue;  
        if (r.homeChunk) {
            const c = r.homeChunk;
            const playerInChunk = (px >= c.x1 && px <= c.x2 + 1 && py >= c.y1 && py <= c.y2 + 1);
            if (!playerInChunk) continue;  
        }
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

_showBossBanner(onDone) {
    const cam = this.cameras.main;
    const W = cam.width, H = cam.height;

    const container = this.add.container(-W, H / 2).setScrollFactor(0).setDepth(999).setScale(2.5);

    const bg = this.add.rectangle(0, 0, 520, 220, 0x0b0b12, 0.96)
        .setStrokeStyle(3, 0x806020);
    const inner = this.add.rectangle(0, 0, 508, 208, 0x000000, 0)
        .setStrokeStyle(1, 0xffcc44, 0.35);
    const bossLabel = this.add.text(60, -78, '\u2014 BOSS \u2014', {
        fontSize: '16px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2
    }).setOrigin(0.5);

    const portraitBg = this.add.rectangle(-150, 0, 140, 140, 0x1c1828, 1)
        .setStrokeStyle(2, 0x806020);
    const portraitAccent = this.add.rectangle(-150 - 68, 0, 4, 140, 0xffcc44, 1);   
    const px1 = this.add.rectangle(-150, 0, 100, 4, 0x222222); px1.angle = 45;
    const px2 = this.add.rectangle(-150, 0, 100, 4, 0x222222); px2.angle = -45;

    const nameText = this.add.text(60, 0, 'CRYSTAL MATRIARCH', {
        fontSize: '40px', color: '#ffffff',
        fontFamily: '"VT323", monospace',
        stroke: '#000', strokeThickness: 5, resolution: 2
    }).setOrigin(0.5);
    const underline = this.add.rectangle(60, 30, nameText.width + 12, 3, 0xffcc44, 0.9);
    const dOff = nameText.width / 2 + 11;   
    const dL = this.add.text(60 - dOff, 0, '\u25C6', { fontSize: '20px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2 }).setOrigin(0.5);
    const dR = this.add.text(60 + dOff, 0, '\u25C6', { fontSize: '20px', color: '#ffd86a', fontFamily: '"VT323", monospace', resolution: 2 }).setOrigin(0.5);

    container.add([bg, inner, bossLabel, portraitBg, portraitAccent, px1, px2, nameText, underline, dL, dR]);

    this.time.delayedCall(20, () => {
        if (this.cameras.main && container.scene) {
            try { this.cameras.main.ignore(container); } catch(e) {}
        }
    });

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

_applyLevelData() {
    // ⚠ 占位地板 — 仅为进场能站住/可测试. 重新设计时整段删掉, 在这里建你的新关卡 (也可用创造模式: 密码 122334455667788990)
    const G = 60;
    const floorRow = 8;                  // y ≈ 510
    for (let c = 10; c <= 18; c++) {     // 出生点 x≈800(col13) 下方一排
        const x = c * G + G / 2, y = floorRow * G + G / 2;
        const block = this.add.rectangle(x, y, G, G, 0x1a0f2e);
        block.setStrokeStyle(2, 0x3b2d59);
        this.physics.add.existing(block, true);
        this.walls.add(block);
        this.wallRects.push({ x: x - G/2, y: y - G/2, width: G, height: G, left: x - G/2, right: x + G/2, top: y - G/2, bottom: y + G/2 });
    }
}

_updateMonstersFiltered(time, delta) {
    if (typeof MonsterManager !== 'undefined' && MonsterManager.update) {
        MonsterManager.update(this, time, delta, this.player);
    }
}
}
if (typeof window !== 'undefined') window.SafeZone6Scene = SafeZone6Scene;
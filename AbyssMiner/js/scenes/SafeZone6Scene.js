/**
 * SAFE ZONE 6 - THE CHROME & CRYSTAL RADIANCY FINALE (PRODUCTION READY)
 * * Architecture:
 * - Restored original 15-row map terrain layout array block cleanly.
 * - Restored roomy 60px grid system properties and 6000x1200 world limits.
 * - Preserved class-based MainGameScene inheritance system and keyboard bindings.
 * - Isolated 1x Screen Scale UI Camera with safety catch blocks to prevent crashes.
 * - Interactive Mouse Trader Burrowing Animation Hook.
 * - Team Credits Section (Ang Yen Peng, Dylan Tan Chun Wei, Low Yong Yi).
 */

let sz6_bossBarrier, sz6_merchant, sz6_arenaLocked = false;
let sz6_dialogueBox, sz6_dialogueText, sz6_dialogueHint, sz6_skipHint;
let sz6_dialogueState = 0; 
let sz6_currentLine = 0; 
let sz6_hazards; 
let sz6_bullets;

let sz6_spawnDoor, sz6_bossDoor;
let sz6_exitWall, sz6_exitStairs, sz6_victoryTrigger;
let sz6_bossBeatenSequence = false;

const sz6_dialogueLines = [
    "Merchant: Oi, dirt-scratcher. Didn't peg ya to survive this deep... gotta hand it to ya, you got grit.",
    "Merchant: 'Fore you go kickin' the hornet's nest, listen up. Them shiny blue rocks you been hoarding? They sprout by suckin' the juice outta the dead down here.",
    "Merchant: I ain't buyin' 'em to get filthy rich. I'm baggin' the infection. Every rock I pocket is one less nasty bug crawlin' its way to the topside.",
    "Merchant: The Big Bad is right through there. The Mother of all this mess. Go on, give 'er hell and finish this."
];

const sz6_terrain = [
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], 
[1,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], 
[1,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1], 
[1,0,0,1,1,0,0,0,0,0,0,1,1,1,1,0,1,1,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,1], 
[1,0,0,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,1], 
[1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,3,1,1], 
[1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,3,3,1,1,1], 
[1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,3,3,1,1,1,1,1], 
[1,0,0,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,3,3,1,1,1,1,1,1,1], 
[1,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,3,3,1,1,1,1,1,1,1,1,1], 
[0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,3,3,1,1,1,1,1,1,1,1,1,1], 
[0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,3,3,1,1,1,1,1,1,1,1,1,1,1,1], 
[1,1,1,1,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1], 
[1,1,1,1,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], 
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]  
];

class SafeZone6Scene extends MainGameScene {
    constructor() {
        super();
        Phaser.Scene.call(this, { key: 'SafeZone6Scene' });
    }

    preload() {
        if (window.AzmLoading) {
            window.AzmLoading.show('Loading Final Arena...');
            window.AzmLoading.setProgress(0);
            this.load.on('progress', (value) => { window.AzmLoading.setProgress(value); });
        }
        this.load.spritesheet('boss_idle', 'assets/Spider/Spider-Idle.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('boss_run', 'assets/Spider/Spider-Run.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('boss_attack', 'assets/Spider/Spider-Attack.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('boss_hurt', 'assets/Spider/Spider-Hurt.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('boss_dead', 'assets/Spider/Spider-Dead.png', { frameWidth: 64, frameHeight: 64 });
    }

    create() {
        if (window.AzmLoading) window.AzmLoading.hide();

        const tileSize = 60; 
        const SPAWN_PLAYER_X   = 360;  
        const SPAWN_PLAYER_Y   = 440;  
        const ENTRANCE_DOOR_X  = 35;   
        const ENTRANCE_DOOR_Y  = 660;  
        const MERCHANT_X       = 530;  
        const MERCHANT_Y       = 800;  
        const CONVERSATION_X_MIN = 500; 
        const CONVERSATION_X_MAX = 830; 
        const INVISIBLE_GATE_X = 3300; 
        const INVISIBLE_GATE_Y = 700;  
        const ARENA_TRIGGER_X  = 3350; 
        const BOSS_SPAWN_X     = 4050; 
        const BOSS_SPAWN_Y     = 150;  
        const ARENA_EXIT_WALL_X = 4770; 
        const ARENA_EXIT_WALL_Y = 900;  
        const VICTORY_TRIGGER_X = 5880; 
        const VICTORY_TRIGGER_Y = 300;  

        sz6_arenaLocked = false;
        sz6_dialogueState = 0;
        sz6_currentLine = 0;
        sz6_bossBeatenSequence = false;
        this.playerCanMove = true; 

        this.cameras.main.setBackgroundColor('#050510'); 
        this.physics.world.setBounds(0, 0, 6000, 1200); 

        this.walls = this.physics.add.staticGroup();
        this.platforms = this.physics.add.staticGroup();
        this.wallRects = []; 

        const safeCreate = (key, textureKey, frameCfg, frameRate, repeat) => {
            if (!this.anims.exists(key) && this.textures.exists(textureKey)) {
                this.anims.create({ key, frames: this.anims.generateFrameNumbers(textureKey, frameCfg), frameRate, repeat });
            }
        };
        safeCreate('idle',          'Miner_stand',        { start: 0, end: 11 }, 12, -1);
        safeCreate('run',           'Miner_run',          { start: 0, end: 5  }, 12, -1);
        safeCreate('melee_attack',  'Miner_melee_attack', { start: 0, end: 2  }, 20, 0);
        safeCreate('jump',          'Miner_jump',         { start: 0, end: 2  }, 14, 0);
        safeCreate('fall',          'Miner_fall',         { start: 0, end: 2  }, 10, 0);

        const safeAnim = (key, texture, endFrame, rate, repeat) => {
            if (!this.anims.exists(key) && this.textures.exists(texture)) {
                this.anims.create({ key, frames: this.anims.generateFrameNumbers(texture, { start: 0, end: endFrame }), frameRate: rate, repeat });
            }
        };
        safeAnim('anim_boss_idle', 'boss_idle', 2, 6, -1);
        safeAnim('anim_boss_run', 'boss_run', 3, 10, -1);
        safeAnim('anim_boss_attack', 'boss_attack', 2, 12, 0);
        safeAnim('anim_boss_hurt', 'boss_hurt', 1, 8, 0);
        safeAnim('anim_boss_dead', 'boss_dead', 0, 1, 0);

        sz6_hazards = this.physics.add.staticGroup(); 
        sz6_bullets = this.physics.add.group();
        sz6_exitStairs = this.physics.add.staticGroup(); 

        this.buildCaveDecorations();

        sz6_spawnDoor = this.add.rectangle(ENTRANCE_DOOR_X, ENTRANCE_DOOR_Y, 30, 120, 0x111122).setStrokeStyle(3, 0x443355).setDepth(5);
        sz6_bossDoor = this.add.rectangle(INVISIBLE_GATE_X, 630, 40, 300, 0x221133).setStrokeStyle(4, 0x9900ff).setDepth(5);
        sz6_exitWall = this.add.rectangle(ARENA_EXIT_WALL_X, ARENA_EXIT_WALL_Y, 60, 120, 0x1a0f2e).setStrokeStyle(2, 0x3b2d59).setDepth(11);
        
        this.physics.add.existing(sz6_exitWall, true);
        this.platforms.add(sz6_exitWall);

        for (let r = 0; r < sz6_terrain.length; r++) {
            for (let c = 0; c < sz6_terrain[r].length; c++) {
                let xPos = c * tileSize + (tileSize / 2);
                let yPos = r * tileSize + (tileSize / 2);

                if (sz6_terrain[r][c] === 1) { 
                    let block = this.add.rectangle(xPos, yPos, tileSize, tileSize, 0x1a0f2e);
                    block.setStrokeStyle(2, 0x3b2d59); 
                    this.physics.add.existing(block, true);
                    this.walls.add(block); 
                    
                    this.wallRects.push({
                        x: xPos - tileSize/2, y: yPos - tileSize/2,
                        width: tileSize, height: tileSize,
                        left: xPos - tileSize/2, right: xPos + tileSize/2,
                        top: yPos - tileSize/2, bottom: yPos + tileSize/2
                    });
                } else if (sz6_terrain[r][c] === 2) {
                    let spike = this.add.triangle(xPos, yPos + 15, 0, 30, 30, 30, 15, 0, 0xff0055);
                    this.physics.add.existing(spike, true);
                    sz6_hazards.add(spike);
                } else if (sz6_terrain[r][c] === 3) {
                    let step = this.add.rectangle(xPos, yPos, tileSize, tileSize, 0x1a0f2e);
                    step.setStrokeStyle(2, 0x3b2d59);
                    this.physics.add.existing(step, true);
                    sz6_exitStairs.add(step);
                    step.setVisible(false);
                    step.body.enable = false;
                }
            }
        }

        this.add.text(120, 520, ">> DEEP MINES AHEAD >>", { fontSize: '24px', fill: '#00ffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setDepth(10);
        let finalHint = this.add.text(2600, 400, ">> WARNING: MATRIARCH LAIR >>", { fontSize: '28px', fill: '#ff0000', fontStyle: 'bold', stroke: '#000000', strokeThickness: 6 }).setDepth(10);
        this.tweens.add({ targets: finalHint, alpha: 0.2, duration: 800, yoyo: true, repeat: -1 });

        sz6_bossBarrier = this.add.rectangle(INVISIBLE_GATE_X, INVISIBLE_GATE_Y, 40, 800, 0x8888ff, 0.5);
        this.physics.add.existing(sz6_bossBarrier, true);
        sz6_bossBarrier.setVisible(false);
        this.physics.world.disable(sz6_bossBarrier); 

        sz6_merchant = this.add.rectangle( 530, 800, 40, 80, 0x00ff00);  
        
        sz6_dialogueBox = this.add.rectangle(800, 750, 1000, 160, 0x000000, 0.85).setScrollFactor(0).setDepth(9999);
        sz6_dialogueBox.setStrokeStyle(3, 0xffffff); 
        sz6_dialogueText = this.add.text(340, 700, "", { fontSize: '24px', fill: '#ffffff', fontFamily: 'monospace', wordWrap: { width: 920 }, lineSpacing: 8 }).setScrollFactor(0).setDepth(10000);
        sz6_dialogueHint = this.add.text(1120, 800, "[ Click to Progress ]", { fontSize: '16px', fill: '#ffff00', fontStyle: 'bold' }).setScrollFactor(0).setDepth(10000);
        sz6_skipHint = this.add.text(1240, 680, "SKIP >>", { fontSize: '16px', fill: '#ff5555', fontStyle: 'bold' }).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(10000);
        
        sz6_dialogueBox.setVisible(false);
        sz6_dialogueText.setVisible(false);
        sz6_dialogueHint.setVisible(false);
        sz6_skipHint.setVisible(false);

        this.keyJump   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyJumpW  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);  
        this.keyCrouch = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyF      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keyE      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.keyShift  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.keyR      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.keyESC    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        
        this.input.keyboard.addCapture([
            Phaser.Input.Keyboard.KeyCodes.SHIFT, Phaser.Input.Keyboard.KeyCodes.SPACE,
            Phaser.Input.Keyboard.KeyCodes.F, Phaser.Input.Keyboard.KeyCodes.E,
            Phaser.Input.Keyboard.KeyCodes.S, Phaser.Input.Keyboard.KeyCodes.R
        ]);

        this.player = new Player(this, SPAWN_PLAYER_X, SPAWN_PLAYER_Y);
        this.movementSystem = new MovementSystem(this);
        
        this.healthSystem    = new HealthSystem(this);    this.healthSystem.init();
        this.diseaseSystem   = new DiseaseSystem(this);   this.diseaseSystem.init(); 
        this.inventorySystem = new BackpackSystem(this);  this.inventorySystem.init();
        this.backpackSystem  = this.inventorySystem;
        this.hudSystem       = new HUDSystem(this);       this.hudSystem.init();
        this.settingsSystem  = new SettingsSystem(this);  this.settingsSystem.init();
        this.interactSystem  = new InteractSystem(this);  this.interactSystem.init();

        this.physics.add.collider(this.player, this.walls);
        this.physics.add.collider(this.player, sz6_bossBarrier);
        this.physics.add.overlap(this.player, sz6_hazards, () => {
            if (this.healthSystem && this.healthSystem.damage) this.healthSystem.damage(2);
        });

        this.cameras.main.setBounds(0, 0, 6000, 1200);
        this.cameras.main.setZoom(1.8); 
        this.cameras.main.startFollow(this.player, true, 0.05, 0.05);

        this.cameraSystem = new CameraSystem(this.cameras.main, this.player);
        this.uiCam = this.cameraSystem.setupUICamera(this);
        
        if (this.uiCam) {
            this.uiCam.setZoom(1); 
            this.uiCam.ignore([this.walls, this.platforms, sz6_hazards, this.player, sz6_merchant, sz6_spawnDoor, sz6_bossDoor, sz6_exitWall]);
        }

        this.cameras.main.ignore([sz6_dialogueBox, sz6_dialogueText, sz6_dialogueHint, sz6_skipHint]);

        // 🚨 CRASH PROTECTED COVER-CHECK MATRIX LAYER: Safe implementation that prevents loop drops
        this.time.delayedCall(100, () => {
            if (this.hudSystem && this.hudSystem.displayGroup && typeof this.hudSystem.displayGroup.getChildren === 'function') {
                this.hudSystem.displayGroup.getChildren().forEach(item => {
                    item.setScrollFactor(0); 
                    this.cameras.main.ignore(item); 
                });
            }
        });

        this._cfgConvMin = CONVERSATION_X_MIN;
        this._cfgConvMax = CONVERSATION_X_MAX;
        this._cfgArenaX  = ARENA_TRIGGER_X;
        this._cfgBossX   = BOSS_SPAWN_X;
        this._cfgBossY   = BOSS_SPAWN_Y;
        this._cfgVictoryX = VICTORY_TRIGGER_X;
        this._cfgVictoryY = VICTORY_TRIGGER_Y;

        this.input.on('pointerdown', (pointer) => {
            if (sz6_dialogueState === 1) {
                sz6_currentLine++;
                if (sz6_currentLine >= sz6_dialogueLines.length) {
                    this.finishDialogue();
                } else {
                    sz6_dialogueText.setText(sz6_dialogueLines[sz6_currentLine]);
                }
            }
        });
    }

    buildCaveDecorations() {
        let graphics = this.add.graphics();
        for(let i=0; i<80; i++) {
            let x = Phaser.Math.Between(100, 4600);
            let y = Phaser.Math.Between(400, 950); 
            let height = Phaser.Math.Between(100, 300);
            let width = Phaser.Math.Between(30, 80);
            graphics.fillStyle(0x112244, 0.5);
            graphics.fillTriangle(x, y, x + width/2, y - height, x + width, y);
        }
    }

    finishDialogue() {
        sz6_dialogueState = 2; 
        this.playerCanMove = true; 
        sz6_dialogueBox.setVisible(false);
        sz6_dialogueText.setVisible(false);
        sz6_dialogueHint.setVisible(false);
        sz6_skipHint.setVisible(false);

        this.tweens.add({ 
            targets: sz6_merchant, 
            y: '+=80', 
            alpha: 0, 
            duration: 1200, 
            ease: 'Cubic.easeIn',
            onComplete: () => { if (sz6_merchant) sz6_merchant.destroy(); }
        }); 
    }

    revealEndgamePassage() {
        if (sz6_exitWall && sz6_exitWall.active) {
            this.cameras.main.shake(800, 0.03);
            
            this.tweens.add({
                targets: sz6_exitWall,
                y: '+=150',
                alpha: 0, 
                duration: 1000,
                ease: 'Cubic.easeIn',
                onComplete: () => {
                    sz6_exitWall.destroy();
                    
                    sz6_exitStairs.getChildren().forEach((step, idx) => {
                        this.time.delayedCall(idx * 60, () => {
                            step.setVisible(true);
                            step.body.enable = true;
                            this.physics.add.collider(this.player, step);
                        });
                    });

                    this.cameras.main.setBounds(3280, 0, 2700, 1200);
                    sz6_victoryTrigger = this.add.rectangle(this._cfgVictoryX, this._cfgVictoryY, 120, 120, 0x00ffff, 0);
                    this.physics.add.existing(sz6_victoryTrigger, true);

                    this.physics.add.overlap(this.player, sz6_victoryTrigger, () => {
                        if (sz6_victoryTrigger) sz6_victoryTrigger.destroy(); 
                        this.executeVictoryCreditsEnding();
                    });
                }
            });
        }
    }

    executeVictoryCreditsEnding() {
        this.playerCanMove = false;
        if (this.player.body) this.player.body.setVelocity(0, 0);
        
        this.cameras.main.flash(1000, 255, 255, 255);
        this.cameras.main.fadeOut(2000, 0, 0, 0);

        this.time.delayedCall(2200, () => {
            this.cameras.main.fadeEffect.reset(); 
            this.cameras.main.setAlpha(1);

            this.add.rectangle(800, 450, 4000, 4000, 0x000000).setScrollFactor(0).setDepth(499);
            
            this.endingLines = [
                "With a final, thundering roar, the Crystal Matriarch shatters into dust...",
                "The corrupting pulse that held the deep nest in a vice grip has finally ceased.",
                "Slowly, you watch as the toxic blue bacteria drains away from the stone formations...",
                "One by one, the corrupted blue crystal beds begin to clear, reclaiming their ancient, golden warmth.",
                "Every single cluster turns back into brilliant yellow crystal—radiant, pure, and completely healed.",
                "The dark underworld has become safe at last. Your long journey is complete.\n\nThank you for playing!"
            ];
            this.endingLineIndex = 0;

            let storyText = this.add.text(800, 450, '', { 
                fontSize: '28px', fill: '#00ffff', fontFamily: 'Courier', fontStyle: 'bold', align: 'center', lineSpacing: 12, wordWrap: { width: 1100 } 
            }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

            let advancePrompt = this.add.text(800, 800, "[ CLICK LEFT MOUSE BUTTON TO PROGRESS STORY ]", { 
                fontSize: '16px', fill: '#ffffff', fontFamily: 'Courier', fontStyle: 'bold' 
            }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

            const showCredits = () => {
                storyText.setText("");
                let creditHeader = this.add.text(800, 250, "--- CREATED BY ---", { fontSize: '32px', fill: '#00ffaa', fontFamily: 'Courier', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(501).setAlpha(0);
                let teamNames = this.add.text(800, 450, "ANG YEN PENG\nDYLAN TAN CHUN WEI\nLOW YONG YI", { fontSize: '42px', fill: '#ffffff', fontFamily: 'Courier', fontStyle: 'bold', align: 'center', lineSpacing: 24 }).setOrigin(0.5).setScrollFactor(0).setDepth(501).setAlpha(0);

                this.tweens.add({ targets: [creditHeader, teamNames], alpha: 1, duration: 2000, ease: 'Power2' });
                if (typeof SaveSystem !== 'undefined') SaveSystem.autoSave(this);
            };

            const progressStoryTimeline = () => {
                if (this.endingLineIndex < this.endingLines.length) {
                    storyText.setAlpha(0);
                    storyText.setText(this.endingLines[this.endingLineIndex]);
                    if (this.endingLineIndex >= 3 && this.endingLineIndex <= 4) storyText.setColor('#ffff00');
                    else if (this.endingLineIndex === 5) { storyText.setColor('#00ffaa'); if (advancePrompt.active) advancePrompt.destroy(); }
                    else storyText.setColor('#00ffff');

                    this.tweens.add({ targets: storyText, alpha: 1, duration: 600 });
                    this.endingLineIndex++;
                } else {
                    this.input.off('pointerdown', progressStoryTimeline);
                    this.time.delayedCall(1500, showCredits);
                }
            };

            this.input.on('pointerdown', progressStoryTimeline);
            progressStoryTimeline();
        });
    }

    update(time, delta) {
        if (!this.player || !this.player.body) return;

        if (sz6_dialogueState === 0 && this.player.x > this._cfgConvMin && this.player.x < this._cfgConvMax && this.player.y > 700) {
            sz6_dialogueState = 1; 
            this.playerCanMove = false; 
            this.player.body.setVelocity(0, 0); 
            sz6_dialogueBox.setVisible(true);
            sz6_dialogueText.setVisible(true);
            sz6_dialogueHint.setVisible(true);
            sz6_skipHint.setVisible(true);
            sz6_dialogueText.setText(sz6_dialogueLines[0]);
        }

        if (!sz6_arenaLocked && this.player.x > this._cfgArenaX) {
            sz6_arenaLocked = true;
            sz6_dialogueState = 6; 
            this.playerCanMove = false; 
            this.player.setPosition(3320, 700);  
            this.cameras.main.setBounds(3280, 0, 1500, 1200); 
            sz6_bossBarrier.setVisible(true);
            this.physics.world.enable(sz6_bossBarrier);
            if (typeof BossManager !== 'undefined') {
                BossManager.spawn(this, this._cfgBossX, this._cfgBossY, this.player, this.platforms, () => {}, true); 
            }
        }

        if (sz6_arenaLocked && typeof BossManager !== 'undefined') { 
            BossManager.update(time, delta, this.player); 
            if (!sz6_bossBeatenSequence && (!BossManager.entity || !BossManager.entity.active)) {
                sz6_bossBeatenSequence = true;
                this.revealEndgamePassage();
            }
        }

        if (this.playerCanMove && this.movementSystem) {
            this.movementSystem.update(time, delta);
        } else {
            this.player.body.setVelocityX(0);
            this.player.anims.play('idle', true);
        }
    }
}

if (typeof window !== 'undefined') window.SafeZone6Scene = SafeZone6Scene;
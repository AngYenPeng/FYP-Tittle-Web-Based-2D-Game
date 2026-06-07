/**
 * SCENE SZ5 - CHROME & CRYSTAL FINALE WITH NARRATIVE RESTORATION
 * 🚨 FIXED: Absolute input mapping freeze. Player controls cut off completely at the tunnel threshold.
 * 🚨 FIXED: Removed duplicate boss dialogue handlers to run directly off boss.js hooks.
 * 🚨 FIXED: Added spawn point background gate and interactive boss room transition threshold door.
 * 🚨 FIXED: Implemented horizontal camera viewport restriction lock past x: 3280 upon arena entry.
 * 🚨 UPGRADED: Expanded matrix to 100 columns with solid wall tiles enclosing the secret tunnel path.
 * 🚨 NEW FINALE STORY SYSTEM: Replaces the blank landing with an interactive narrative detailing the crystals converting from blue to healthy gold.
 */

// --- SZ5 SPECIFIC VARIABLES ---
let sz_bossBarrier, sz_merchant, sz_arenaLocked = false;
let sz_dialogueBox, sz_dialogueText, sz_dialogueHint, sz_skipHint;
let sz_dialogueState = 0; 
let sz_currentLine = 0; 
let hazards; 

// --- SCENE LAYER HANDLES ---
let sz_spawnDoor, sz_bossDoor;
let sz_exitWall, sz_exitStairs, sz_victoryTrigger;
let sz_bossBeatenSequence = false;

const sz_dialogueLines = [
    "Merchant: Oi, dirt-scratcher. Didn't peg ya to survive this deep... gotta hand it to ya, you got grit.",
    "Merchant: 'Fore you go kickin' the hornet's nest, listen up. Them shiny blue rocks you been hoarding? They sprout by suckin' the juice outta the dead down here.",
    "Merchant: I ain't buyin' 'em to get filthy rich. I'm baggin' the infection. Every rock I pocket is one less nasty bug crawlin' its way to the topside.",
    "Merchant: The Big Bad is right through there. The Mother of all this mess. Go on, give 'er hell and finish this."
];

// 1 = Solid Wall, 2 = Spike, 0 = Empty Tunnel Air, 3 = HIDDEN ESCAPE STAIRS
const sz5_terrain = [
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
[1,1,1,1,0,0,1,1,1,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1], 
[1,1,1,1,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], 
[1,1,1,1,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], 
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], 
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]  
];

class SceneSZ5 extends Phaser.Scene {
    constructor() {
        super('SceneSZ5'); 
    }

    preload() {
        this.load.spritesheet('boss_idle', 'assets/Spider/Spider-Idle.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('boss_run', 'assets/Spider/Spider-Run.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('boss_attack', 'assets/Spider/Spider-Attack.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('boss_hurt', 'assets/Spider/Spider-Hurt.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('boss_dead', 'assets/Spider/Spider-Dead.png', { frameWidth: 64, frameHeight: 64 });
    }

    create() {
        sz_arenaLocked = false;
        sz_dialogueState = 0;
        sz_currentLine = 0;
        sz_bossBeatenSequence = false;
        this.playerCanMove = true; 

        this.cameras.main.setBackgroundColor('#050510'); 
        this.physics.world.setBounds(0, 0, 6000, 1200);

        this.anims.create({ key: 'anim_boss_idle', frames: this.anims.generateFrameNumbers('boss_idle', { start: 0, end: 2 }), frameRate: 6, repeat: -1 });
        this.anims.create({ key: 'anim_boss_run', frames: this.anims.generateFrameNumbers('boss_run', { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
        this.anims.create({ key: 'anim_boss_attack', frames: this.anims.generateFrameNumbers('boss_attack', { start: 0, end: 2 }), frameRate: 12, repeat: 0 });
        this.anims.create({ key: 'anim_boss_hurt', frames: this.anims.generateFrameNumbers('boss_hurt', { start: 0, end: 1 }), frameRate: 8, repeat: 0 });
        this.anims.create({ key: 'anim_boss_dead', frames: this.anims.generateFrameNumbers('boss_dead', { start: 0, end: 0 }), frameRate: 1, repeat: 0 });

        platforms = this.physics.add.staticGroup();
        hazards = this.physics.add.staticGroup(); 
        bullets = this.physics.add.group();
        sz_exitStairs = this.physics.add.staticGroup(); 

        this.buildCaveDecorations();

        sz_spawnDoor = this.add.rectangle(35, 660, 30, 120, 0x111122).setStrokeStyle(3, 0x443355).setDepth(5);
        sz_bossDoor = this.add.rectangle(3300, 630, 40, 300, 0x221133).setStrokeStyle(4, 0x9900ff).setDepth(5);

        // EXIT WALL: Seals the arena until the boss dies
        sz_exitWall = this.add.rectangle(4770, 900, 60, 120, 0x1a0f2e).setStrokeStyle(2, 0x3b2d59).setDepth(11);
        this.physics.add.existing(sz_exitWall, true);
        platforms.add(sz_exitWall);

        const tileSize = 60;
        for (let r = 0; r < sz5_terrain.length; r++) {
            for (let c = 0; c < sz5_terrain[r].length; c++) {
                let xPos = c * tileSize + (tileSize / 2);
                let yPos = r * tileSize + (tileSize / 2);

                if (sz5_terrain[r][c] === 1) { 
                    let block = this.add.rectangle(xPos, yPos, tileSize, tileSize, 0x1a0f2e);
                    block.setStrokeStyle(2, 0x3b2d59); 
                    this.physics.add.existing(block, true);
                    platforms.add(block);
                } else if (sz5_terrain[r][c] === 2) {
                    let spike = this.add.triangle(xPos, yPos + 15, 0, 30, 30, 30, 15, 0, 0xff0055);
                    this.physics.add.existing(spike, true);
                    hazards.add(spike);
                } 
                else if (sz5_terrain[r][c] === 3) {
                    let step = this.add.rectangle(xPos, yPos, tileSize, tileSize, 0x1a0f2e);
                    step.setStrokeStyle(2, 0x3b2d59);
                    this.physics.add.existing(step, true);
                    sz_exitStairs.add(step);
                    step.setVisible(false);
                    step.body.enable = false;
                }
            }
        }

        this.add.text(120, 520, ">> DEEP MINES AHEAD >>", { fontSize: '24px', fill: '#00ffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setDepth(10);

        let finalHint = this.add.text(2600, 400, ">> WARNING: MATRIARCH LAIR >>", { fontSize: '28px', fill: '#ff0000', fontStyle: 'bold', stroke: '#000000', strokeThickness: 6 }).setDepth(10);
        this.tweens.add({ targets: finalHint, alpha: 0.2, duration: 800, yoyo: true, repeat: -1 });

        sz_bossBarrier = this.add.rectangle(3300, 700, 40, 800, 0x8888ff, 0.5);
        this.physics.add.existing(sz_bossBarrier, true);
        sz_bossBarrier.setVisible(false);
        this.physics.world.disable(sz_bossBarrier); 

        sz_merchant = this.add.rectangle(500, 860, 40, 80, 0x00ff00); 
        
        sz_dialogueBox = this.add.rectangle(533, 500, 700, 120, 0x000000, 0.8).setScrollFactor(0).setDepth(100);
        sz_dialogueBox.setStrokeStyle(3, 0xffffff); 
        sz_dialogueText = this.add.text(200, 455, "", { fontSize: '18px', fill: '#ffffff', wordWrap: { width: 620 }, lineSpacing: 6 }).setScrollFactor(0).setDepth(100);
        sz_dialogueHint = this.add.text(660, 535, "[ Left Click to Continue ]", { fontSize: '14px', fill: '#ffff00', fontStyle: 'bold' }).setScrollFactor(0).setDepth(100);
        sz_skipHint = this.add.text(800, 445, "SKIP >>", { fontSize: '14px', fill: '#ff5555', fontStyle: 'bold' }).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(100);
        
        sz_dialogueBox.setVisible(false);
        sz_dialogueText.setVisible(false);
        sz_dialogueHint.setVisible(false);
        sz_skipHint.setVisible(false);

        player = this.physics.add.sprite(90, 400, 'miner_img');
        player.setCollideWorldBounds(true); 
        
        this.cameras.main.setBounds(0, 0, 6000, 1200); 
        this.cameras.main.startFollow(player, true, 0.05, 0.05);
        this.cameras.main.setZoom(1.1);

        this.physics.add.collider(player, platforms);
        this.physics.add.collider(player, sz_bossBarrier);
        this.physics.add.overlap(player, hazards, () => { globalTouchHazard(player, hazards); });

        keys = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            shift: Phaser.Input.Keyboard.KeyCodes.SHIFT
        });
        
        this.input.on('pointerdown', (pointer) => {
            if (sz_dialogueState === 1) {
                sz_currentLine++;
                if (sz_currentLine >= sz_dialogueLines.length) {
                    this.finishDialogue();
                } else {
                    sz_dialogueText.setText(sz_dialogueLines[sz_currentLine]);
                }
            } 
            else if (sz_dialogueState === 0 || sz_dialogueState === 2 || sz_dialogueState === 6) {
                if (this.playerCanMove) {
                    globalShootBullet(this, pointer); 
                }
            }
        });

        healthText = this.add.text(20, 15, 'Health: ' + Math.ceil((health / maxHealth) * 100) + '%', { fontSize: '20px', fill: '#ffffff' }).setScrollFactor(0).setDepth(100);
        dashBar = this.add.rectangle(20, 45, 100, 8, 0x00ffff).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100);
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
        sz_dialogueState = 2; 
        this.playerCanMove = true; 
        sz_dialogueBox.setVisible(false);
        sz_dialogueText.setVisible(false);
        sz_dialogueHint.setVisible(false);
        sz_skipHint.setVisible(false);

        // 🚨 NEW MOUSE BURROWING ANIMATION:
        // He moves down into the dirt floor (y: '+=80') while fading out completely (alpha: 0)
        this.tweens.add({ 
            targets: sz_merchant, 
            y: '+=80', 
            alpha: 0, 
            duration: 1200, 
            ease: 'Cubic.easeIn',
            onComplete: () => {
                if (sz_merchant) {
                    sz_merchant.destroy(); // Safely removes the mouse merchant from the game world
                }
            }
        }); 
    }

    revealEndgamePassage() {
        if (sz_exitWall && sz_exitWall.active) {
            this.cameras.main.shake(800, 0.03);
            
            this.tweens.add({
                targets: sz_exitWall,
                y: '+=150',
                alpha: 0,
                duration: 1000,
                ease: 'Cubic.easeIn',
                onComplete: () => {
                    sz_exitWall.destroy();
                    
                    sz_exitStairs.getChildren().forEach((step, idx) => {
                        this.time.delayedCall(idx * 60, () => {
                            step.setVisible(true);
                            step.body.enable = true;
                            this.physics.add.collider(player, step);
                            
                            let smoke = this.add.circle(step.x, step.y, 8, 0xaaaaaa, 0.3);
                            this.tweens.add({ targets: smoke, y: '-=30', alpha: 0, duration: 500, onComplete: () => smoke.destroy() });
                        });
                    });

                    this.cameras.main.setBounds(3280, 0, 2700, 1200);

                    sz_victoryTrigger = this.add.rectangle(5880, 300, 120, 120, 0x00ffff, 0);
                    this.physics.add.existing(sz_victoryTrigger, true);
                    
                    this.add.text(5600, 200, "▲ ESCAPE TO SURFACE ▲", { 
                        fontSize: '18px', fill: '#00ffff', fontStyle: 'bold', fontFamily: 'Courier' 
                    }).setDepth(12);

                    // 🚨 FIXED: Destroys the trigger immediately on contact so it cannot run more than once!
                    this.physics.add.overlap(player, sz_victoryTrigger, () => {
                        if (sz_victoryTrigger) {
                            sz_victoryTrigger.destroy(); 
                            sz_victoryTrigger = null;
                        }
                        this.executeVictoryCreditsEnding();
                    });
                }
            });
        }
    }

   executeVictoryCreditsEnding() {
        this.playerCanMove = false;
        player.body.setVelocity(0, 0);
        
        this.cameras.main.flash(1000, 255, 255, 255);
        this.cameras.main.fadeOut(2000, 0, 0, 0);

        this.time.delayedCall(2200, () => {
            this.cameras.main.fadeEffect.reset(); 
            this.cameras.main.setAlpha(1);

            let endCardBg = this.add.rectangle(533, 300, 4000, 4000, 0x000000).setScrollFactor(0).setDepth(499);
            
            this.endingLines = [
                "With a final, thundering roar, the Crystal Matriarch shatters into dust...",
                "The corrupting pulse that held the deep nest in a vice grip has finally ceased.",
                "Slowly, you watch as the toxic blue bacteria drains away from the stone formations...",
                "One by one, the corrupted blue crystal beds begin to clear, reclaiming their ancient, golden warmth.",
                "Every single cluster turns back into brilliant yellow crystal—radiant, pure, and completely healed.",
                "The dark underworld has become safe at last. Your long journey is complete.\n\nThank you for playing!"
            ];
            this.endingLineIndex = 0;

            let storyText = this.add.text(533, 300, '', { 
                fontSize: '20px', 
                fill: '#00ffff', 
                fontFamily: 'Courier', 
                fontStyle: 'bold', 
                align: 'center', 
                lineSpacing: 10,
                wordWrap: { width: 800 } 
            }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

            let advancePrompt = this.add.text(533, 520, "[ CLICK LEFT MOUSE BUTTON TO PROGRESS STORY ]", { 
                fontSize: '12px', 
                fill: '#ffffff', 
                fontFamily: 'Courier', 
                fontStyle: 'bold' 
            }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

            const showCredits = () => {
                // Clear the story text
                storyText.setText("");
                
                // Create a "Created By" heading
                let creditHeader = this.add.text(533, 200, "--- CREATED BY ---", {
                    fontSize: '24px', fill: '#00ffaa', fontFamily: 'Courier', fontStyle: 'bold'
                }).setOrigin(0.5).setScrollFactor(0).setDepth(501).setAlpha(0);

                // Add your team names
                let teamNames = this.add.text(533, 320, 
                    "ANG YEN PENG\nDYLAN TAN CHUN WEI\nLOW YONG YI", {
                    fontSize: '32px', fill: '#ffffff', fontFamily: 'Courier', fontStyle: 'bold', align: 'center', lineSpacing: 20
                }).setOrigin(0.5).setScrollFactor(0).setDepth(501).setAlpha(0);

                // Fade them in nicely
                this.tweens.add({
                    targets: [creditHeader, teamNames],
                    alpha: 1,
                    duration: 2000,
                    ease: 'Power2'
                });
            };

            const progressStoryTimeline = () => {
                if (this.endingLineIndex < this.endingLines.length) {
                    storyText.setAlpha(0);
                    storyText.setText(this.endingLines[this.endingLineIndex]);
                    
                    if (this.endingLineIndex >= 3 && this.endingLineIndex <= 4) {
                        storyText.setColor('#ffff00');
                    } else if (this.endingLineIndex === 5) {
                        storyText.setColor('#00ffaa');
                        if (advancePrompt && advancePrompt.active) {
                            advancePrompt.destroy();
                        }
                    } else {
                        storyText.setColor('#00ffff');
                    }

                    this.tweens.add({
                        targets: storyText,
                        alpha: 1,
                        duration: 600
                    });

                    this.endingLineIndex++;
                } else {
                    // 🚨 Trigger credits once the story is done
                    this.input.off('pointerdown', progressStoryTimeline);
                    this.time.delayedCall(1500, showCredits);
                }
            };

            this.input.on('pointerdown', progressStoryTimeline);
            progressStoryTimeline();
        });
    }

    update(time, delta) {
        if (health <= 0) return;

        if (sz_dialogueState === 0 && player.x > 400 && player.x < 600 && player.y > 850) {
            sz_dialogueState = 1; 
            this.playerCanMove = false; 
            player.body.setVelocity(0, 0); 
            sz_dialogueBox.setVisible(true);
            sz_dialogueText.setVisible(true);
            sz_dialogueHint.setVisible(true);
            sz_skipHint.setVisible(true);
            sz_dialogueText.setText(sz_dialogueLines[0]);
        }

        if (!sz_arenaLocked && player.x > 3350) {
            sz_arenaLocked = true;
            sz_dialogueState = 6; 
            this.playerCanMove = false; 
            player.setPosition(3320, 700); 
            this.cameras.main.setBounds(3280, 0, 1500, 1200);
            sz_bossBarrier.setVisible(true);
            this.physics.world.enable(sz_bossBarrier);
            BossManager.spawn(this, 4050, 150, player, platforms, globalTouchHazard, true);
        }

        if (sz_arenaLocked) { 
            BossManager.update(time, delta, player); 
            if (!sz_bossBeatenSequence && (!BossManager.entity || !BossManager.entity.active)) {
                sz_bossBeatenSequence = true;
                this.revealEndgamePassage();
            }
        }

        if (this.playerCanMove) {
            updatePlayerLogic(this, keys);
        } else {
            player.body.setVelocityX(0); 
        }
    }
}
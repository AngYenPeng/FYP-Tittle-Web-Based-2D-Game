/**
 * THE CRYSTAL MATRIARCH - APEX CINEMATIC EDITION
 * 🚨 RETRIEVED & LOCKED: Complete original full-length class codebase with all skills preserved.
 * 🚨 FIXED: Under-platform ceiling traps resolved via dynamic position tracking lunge sequences.
 * 🚨 FIXED: spitStickyWebs upgraded with direct object-tracking vectors and a 150ms geometry clearance delay window.
 * 🚨 FIXED: Camera zoom and dialogue text placement coordinates re-mapped to prevent cutting off or blinking out.
 * 🚨 FIXED: Dialogue timeline converted to manual left-mouse click progression with aligned prompt containers.
 * 🚨 FIXED: Resolved Phase 3 lunge corners lock up by injecting wall-blocking directional override protection vectors.
 * 🚨 FIXED: Eradicated graphics rendering crash upon dialogue completion by restructuring .scale assignments to native .setScale handlers.
 * 🚨 FIXED: Removed duplicate click confirmations and double-jumping player force bugs upon arena engagement.
 * 🚨 FIXED: Synchronized player position holding inside the tunnel, releasing input controls with a single unified slam shock jump.
 * 🚨 UPGRADED: Phase 2 Silk Sky Spray ("地图炮") & Phase 3 Radial Web Supernova fully configured.
 * 🚨 APEX FINALES: Added spider Vibration Tracking Sense and Phase 3 Mid-Health Camouflage Molting.
 * 🚨 CRASH-PROOFED: Added safePlay animation wrapper to prevent missing key execution crashes.
 * 🚨 RE-ALIGNED: Remapped UI geometry layout vectors from 533 to 800 to perfectly fit 1600-res display scenes.
 */
class CrystalMatriarch extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, player, platforms, playerHitCallback, isIntro = false) {

        // Fallback checks to prevent crashing if texture is missing from preload
        const fallbackTexture = scene.textures.exists('boss_idle') ? 'boss_idle' : 'Miner_stand';
        super(scene, x, y, fallbackTexture); 
        scene.add.existing(this);
        scene.physics.add.existing(this);
// 强制开启 ARCADE 物理引擎的碰撞边界处理，防止冲刺过快直接穿墙
this.body.setCollideWorldBounds(true);
this.body.onWorldBounds = true;

// 确保 Body 绝对不会进入“空壳”状态
this.body.enable = true;

        // Safe animation player wrapper to prevent runtime asset registration crashes
        this.safePlay = (key, startFrame = true) => {
            if (this.scene && this.scene.anims && this.scene.anims.exists(key)) {
                this.play(key, startFrame);
            } else {
                console.warn(`[Boss AI Warning] Animation key "${key}" is missing from registry. Fallback preserved.`);
            }
        };

        // Force the boss to treat walls as solid entities at all times
        this.body.onCollide = true;
        this.body.immovable = false;

        this.scene = scene;
        this.player = player;
        this.platforms = platforms;
        this.playerHitCallback = playerHitCallback;

        this.baseScale = 4.5; 
        this.setScale(this.baseScale);
        this.body.setSize(35, 35, true);   // Slims and flattens the collision matrix box properties
        this.body.setOffset(10, 5);
        this.body.setAllowGravity(true); 
        this.setDepth(12); 

        // Enforce hard structural bounds lock tracking
        this.body.setCollideWorldBounds(true);

        this.maxHealth = 3; 
        this.hp = this.maxHealth;
        this.lives = 3; 

        this.isCasting = false; 
        this.isReviving = false; 
        this.isDead = false; 
        this.isDashing = false;
        this.isZipping = false; 
        this.zipStep = 0; 
        this.isMiningWithPickaxe = false;
        
        this.skitterTimer = 1000;
        this.isSkittering = false;
        this.skitterBoost = 1;
        
        this.animLock = false; 
        this.venomCD = 0; 
        this.lastFacingLeft = false; 

        this.playerHistory = []; 
        this.attackAssets = []; 
        this.stickyWebs = scene.physics.add.group();
        this.toxicPuddles = scene.physics.add.group(); 

        this.surface = 'air'; 
        this.moveSpeed = 260; 
        this.lastWebX = x;
        this.lastWebY = y;

        // SOLID SAMPLING WATCHDOG ANCHORS
        this.stuckCheckTimer = 0; 
        this.lastStuckX = x;
        this.lastStuckY = y;
        this.timeSpentStuck = 0;
        this.unstuckCooldown = 0; 
        this.underPlatformEscaping = false; 
        this.escapeDirX = 1; 
        
        this.dashChainCount = 0; 
        this.hasMolted = false; 

        // 🌟 GEOMETRY VECTOR FIX: Remapped X alignment positions from 533/253 to 800/500 to match scene canvas centers
        this.healthBarBg = scene.add.rectangle(800, 50, 600, 25, 0x000000).setScrollFactor(0).setDepth(100);
        this.healthBar = scene.add.rectangle(800, 50, 600, 25, 0x00aaff).setScrollFactor(0).setDepth(100); 
        this.bossNameText = scene.add.text(500, 20, `THE CRYSTAL MATRIARCH [LIVES: 3]`, { fontSize: '18px', fill: '#00aaff', fontFamily: 'Courier', fontStyle: 'bold' }).setScrollFactor(0).setDepth(100);
        
        this.safePlay('anim_boss_run', true);
        
        // --- CINEMATIC INTRO SECTIONS ---
        if (isIntro) {
            this.isCasting = true; 
            this.body.setAllowGravity(false);
            this.x = 2112; 
            this.y = 96; 
            this.alpha = 1; 
            
            this.healthBarBg.setAlpha(0);
            this.healthBar.setAlpha(0);
            this.bossNameText.setAlpha(0);

            this.cinematicDarkness = scene.add.rectangle(this.x, 400, 3200, 1000, 0x000000, 0.85).setDepth(10);
            this.introWeb = scene.add.graphics().setDepth(11);
            this.cornerTerritoryWebs = scene.add.graphics().setDepth(5).setAlpha(0);
            this.angle = 180;

            // Pendulum Swing Animation
            this.introSwingTween = scene.tweens.add({
                targets: [this], 
                x: '+=60',
                angle: '+=15',
                duration: 900,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
                onUpdate: () => {
                    if (this.introWeb && this.active) {
                        this.introWeb.clear();
                        this.introWeb.lineStyle(3, 0xffffff, 0.8);
                        this.introWeb.beginPath();
                        this.introWeb.moveTo(2112, 320);
                        this.introWeb.lineTo(this.x, this.y);
                        this.introWeb.strokePath();
                    }
                }
            });

            // Venom Drool Loop
            this.droolTimer = scene.time.addEvent({
                delay: 450, loop: true,
                callback: () => {
                    if (this.active && this.isCasting && !this.isDead) {
                        let drop = scene.add.circle(this.x + Phaser.Math.Between(-10, 10), this.y + 30, 4, 0x00ff00).setDepth(11);
                        this.scene.physics.add.existing(drop);
                        drop.body.setAllowGravity(true);
                        this.scene.time.delayedCall(800, () => drop.destroy());
                    }
                }
            });

            this.executeCinematicDialogueTimeline();
        } else {
            this.body.setAllowGravity(true);
            this.isCasting = false;
            this.startAttackLoop(2500); 
        }
    }

    executeCinematicDialogueTimeline() {
        let cam = this.scene.cameras.main;
        cam.stopFollow();
        
        cam.pan(this.x - 150, this.y + 160, 1000, 'Cubic.easeInOut');
        cam.zoomTo(1.5, 500, 'Cubic.easeInOut'); 

        this.introLines = [
            "MATRIARCH: *Kkrrrr-hiss*... The frantic scurry of a trapped insect...\nDid you truly believe you could invade the heart of my nest unpunished?",
            "MATRIARCH: Wait... those heavy iron tools... DUAL PICKAXES?!\nYou dare bring scrap metal to harvest my crystal shell and slaughter my brood?!",
            "MATRIARCH: GRAVEROBBERS! SACRILEGIOUS THIEVES!\nI SHALL WEAVE YOUR FRAGILE BONES INTO THE WEFT OF MY COBWEB THRONE!"
        ];
        this.introLineIndex = 0;

        // 🌟 GEOMETRY VECTOR FIX: Re-centered dialogue bubble bounds at 800
        this.speechBubbleBg = this.scene.add.rectangle(800, 500, 720, 130, 0x111122, 0.95).setStrokeStyle(3, 0xaa00aa).setDepth(200).setScrollFactor(0);
        this.speechText = this.scene.add.text(800, 485, '', { fontSize: '16px', fill: '#ffffff', fontFamily: 'Courier', fontStyle: 'bold', align: 'center', wordWrap: { width: 660 } }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
        this.clickPromptText = this.scene.add.text(800, 545, "[ CLICK LEFT MOUSE BUTTON TO CONTINUE ]", { fontSize: '12px', fill: '#00ffff', fontFamily: 'Courier', fontStyle: 'bold' }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
        this.skipButtonText = this.scene.add.text(1130, 455, "SKIP >>", { fontSize: '14px', fill: '#ff0055', fontFamily: 'Courier', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(202).setScrollFactor(0).setInteractive({ useHandCursor: true });
        
        this.skipButtonText.on('pointerdown', (pointer, localX, localY, event) => {
            if(event) event.stopPropagation(); 
            this.terminateDialogueEngineSafely();
        });

        this.advanceIntroDialogueLine();
        this.scene.input.on('pointerdown', this.handleIntroClickProgress, this);
    }

    handleIntroClickProgress() {
        this.advanceIntroDialogueLine();
    }

    advanceIntroDialogueLine() {
        let cam = this.scene.cameras.main;
        
        if (this.introLineIndex < this.introLines.length) {
            if (this.speechText && this.speechText.active) {
                this.speechText.setText(this.introLines[this.introLineIndex]);
            }
            
            if (this.introLineIndex === 0) {
                this.scene.tweens.add({ targets: this, alpha: 0.5, duration: 250, yoyo: true, repeat: 1 });
                cam.shake(400, 0.006);
            } else if (this.introLineIndex === 1) {
                this.setTintFill(0xff00ff);
                this.scene.time.delayedCall(200, () => this.clearTint());
                cam.shake(600, 0.015);
            } else if (this.introLineIndex === 2) {
                this.setTintFill(0xff0000);
                this.scene.time.delayedCall(300, () => this.clearTint());
                cam.flash(500, 255, 0, 0);
                cam.shake(1200, 0.025);
            }
            this.introLineIndex++;
        } else {
            this.terminateDialogueEngineSafely();
        }
    }

    terminateDialogueEngineSafely() {
        this.scene.input.off('pointerdown', this.handleIntroClickProgress, this);
        
        if (this.speechBubbleBg) { this.speechBubbleBg.destroy(); this.speechBubbleBg = null; }
        if (this.speechText) { this.speechText.destroy(); this.speechText = null; }
        if (this.clickPromptText) { this.clickPromptText.destroy(); this.clickPromptText = null; }
        if (this.skipButtonText) { this.skipButtonText.destroy(); this.skipButtonText = null; }
        
        this.startIntroRoar();
    }

    startIntroRoar() {
        if(this.droolTimer) this.droolTimer.remove();
        if(this.introSwingTween) this.introSwingTween.stop();
        this.scene.tweens.killTweensOf(this); 
        
        if (this.introWeb) this.introWeb.clear();
        this.angle = 0; 

        this.safePlay('anim_boss_run', true);
        let dropWeb = this.scene.add.graphics().setDepth(11);

        this.scene.tweens.add({
            targets: this,
            x: 2112, 
            y: 250,  
            duration: 650, 
            ease: 'Expo.easeIn', 
            onUpdate: () => {
                if (dropWeb && this.active) {
                    dropWeb.clear();
                    dropWeb.lineStyle(4, 0xffffff, 0.8);
                    dropWeb.beginPath();
                    dropWeb.moveTo(2112, 320); 
                    dropWeb.lineTo(this.x, this.y); 
                    dropWeb.strokePath();
                }
            },
            onComplete: () => {
        if (dropWeb) dropWeb.destroy(); 
        
        // 🌟 核心修复：当 Boss 成功砸到地面时，让背景里的紫色蛛网在 0.5 秒内渐变消失并彻底释放内存
        if (this.cornerTerritoryWebs) {
            this.scene.tweens.add({
                targets: this.cornerTerritoryWebs,
                alpha: 0,
                duration: 500,
                onComplete: () => {
                    if (this.cornerTerritoryWebs) this.cornerTerritoryWebs.destroy();
                }
            });
        }

        this.surface = 'floor';
        this.angle = 0;
                
                if (this.player && this.player.body) {
                    this.player.body.setVelocityY(-350);
                    this.player.body.setVelocityX(250); 
                }

                if (this.scene && this.scene.playerCanMove !== undefined) {
                    this.scene.playerCanMove = true;
                }

                this.executeArenaBattleEngagement();
            }
        });
    }

    executeArenaBattleEngagement() {
        if (this.cinematicDarkness) {
            this.scene.tweens.add({ targets: this.cinematicDarkness, alpha: 0, duration: 600, onComplete: () => this.cinematicDarkness.destroy() });
        }

        this.surface = 'floor';
        this.angle = 0;

        this.safePlay('anim_boss_attack', true);
        this.setTintFill(0xff00ff); 
        
        this.scene.cameras.main.flash(400, 255, 255, 255); 
        this.scene.cameras.main.shake(1200, 0.045);

        this.scene.time.delayedCall(350, () => this.clearTint());

        for (let i = 0; i < 60; i++) {
            let color = Phaser.Math.RND.pick([0x00ffff, 0x221133, 0xaaaaaa, 0xffffff]);
            let chunk = this.scene.add.rectangle(this.x, this.y + 40, Phaser.Math.Between(6, 12), Phaser.Math.Between(6, 12), color).setDepth(12);
            this.scene.physics.add.existing(chunk);
            chunk.body.setVelocity(Phaser.Math.Between(-1600, 1600), Phaser.Math.Between(-900, -200));
            chunk.body.setAllowGravity(true);
            this.scene.tweens.add({ targets: chunk, alpha: 0, angle: 720, duration: Phaser.Math.Between(800, 1500), onComplete: () => chunk.destroy() });
        }

        let shock = this.scene.add.ellipse(this.x, this.y + 40, 50, 15, 0x00ffff, 0.8).setDepth(11);
        this.scene.tweens.add({ 
            targets: shock, 
            scaleX: 80, 
            scaleY: 4,
            alpha: 0, 
            duration: 700, 
            ease: 'Cubic.easeOut',
            onComplete: () => shock.destroy() 
        });

        this.player.setTint(0xff0000);
        this.scene.time.delayedCall(200, () => this.player.clearTint());

        if (this.cornerTerritoryWebs) {
            this.cornerTerritoryWebs.alpha = 1;
            this.cornerTerritoryWebs.lineStyle(4, 0xaa00aa, 0.35);
            for (let i = 0; i < 4; i++) { this.cornerTerritoryWebs.lineBetween(this.x, this.y, this.x - 400 + (i * 120), this.y - 1000); }
            for (let i = 0; i < 4; i++) { this.cornerTerritoryWebs.lineBetween(this.x, this.y, this.x + 700 - (i * 120), this.y - 1000); }
            this.cornerTerritoryWebs.setScale(0.5); this.cornerTerritoryWebs.x = this.x * 0.5; this.cornerTerritoryWebs.y = this.y * 0.5;
            this.scene.tweens.add({ targets: this.cornerTerritoryWebs, scaleX: 1, scaleY: 1, x: 0, y: 0, duration: 350, ease: 'Cubic.easeOut' });
        }

        this.healthBarBg.setAlpha(1);
        this.healthBar.setAlpha(1);
        this.bossNameText.setAlpha(1);
        this.healthBar.width = 0; 
        
        this.scene.tweens.add({
            targets: this.healthBar,
            width: 600, 
            duration: 2000,
            onComplete: () => {
                this.body.setAllowGravity(true);
                this.scene.cameras.main.startFollow(this.player, true, 0.05, 0.05);
                this.scene.cameras.main.zoomTo(2.5, 1000, 'Sine.easeInOut'); 
                this.isCasting = false;
                this.startAttackLoop(2500);
            }
        });
    }

    track(asset) {
        if (asset) this.attackAssets.push(asset);
        return asset;
    }

    clearAttacks() {
        if (this.attackAssets) {
            this.attackAssets.forEach(asset => {
                if (asset) {
                    if (typeof asset.remove === 'function') asset.remove(); 
                    if (typeof asset.destroy === 'function') asset.destroy(); 
                }
            });
        }
        this.attackAssets = [];
        if (this.scene) this.scene.tweens.killTweensOf(this); 
    }

    startAttackLoop(delayTime) {
        if (!this.active || !this.scene || this.isDead) return;
        if (this.attackTimerEvent) this.attackTimerEvent.remove(); 
        this.attackTimerEvent = this.scene.time.addEvent({
            delay: delayTime, 
            callback: () => { if (this.active && !this.isDead && this.surface !== 'air') this.chooseAttack(); },
            loop: true
        });
    }

    chooseAttack() {
        if (!this.active || this.hp <= 0 || this.isReviving || this.isDead || this.isDashing || this.isCasting || this.isZipping) return;

        let dist = Phaser.Math.Distance.Between(this.x, this.y, this.player.x, this.player.y);
        let playerAbove = this.player.y < this.y - 120;
        let playerAligned = Math.abs(this.player.x - this.x) < 300;

        if ((playerAbove && playerAligned && Math.random() < 0.7) || (dist > 600 && Math.random() < 0.5)) {
            this.dynamicWebZip();
            return;
        }

        let attackChoice = Phaser.Math.Between(1, 100);

        if (this.surface === 'ceiling') {
            if (attackChoice < 50) this.webBombardment(); 
            else this.bungeeDrop(); 
        } else if (this.surface === 'floor') {
            if (this.lives === 1 && attackChoice < 40) {
                this.desperationWebStorm();
                return;
            }
            if (this.lives === 2 && attackChoice < 35) {
                this.silkSkyBarrage();
                return;
            }

            if (attackChoice < 30) this.frenzyCharge(); 
            else if (attackChoice < 60) this.spitStickyWebs(); 
            else if (attackChoice < 85) this.toxicVenomPuddles(); 
            else this.layEggSac();  
        } else if (this.surface === 'left_wall' || this.surface === 'right_wall') {
            this.grapplePull();     
        }
    }
    
    snatchPickaxe() {
        this.isCasting = true;
        this.safePlay('anim_boss_attack', true);

        let webLine = this.scene.add.graphics().setDepth(15);
        
        this.scene.tweens.add({
            targets: { t: 0 },
            t: 1,
            duration: 300,
            onUpdate: (tween) => {
                webLine.clear();
                webLine.lineStyle(2, 0xffffff, 1);
                webLine.lineBetween(this.x, this.y, 
                    Phaser.Math.Interpolation.Linear([this.x, this.player.x], tween.getValue()),
                    Phaser.Math.Interpolation.Linear([this.y, this.player.y], tween.getValue())
                );
            },
            onComplete: () => {
                if (Phaser.Math.Distance.Between(this.x, this.y, this.player.x, this.player.y) < 150) {
                    this.player.setTint(0xff0000); 
                    this.isMiningWithPickaxe = true; 
                    
                    this.scene.time.addEvent({
                        delay: 200,
                        repeat: 10,
                        callback: () => {
                            this.spawnDebris(this.x + (this.flipX ? -40 : 40), this.y + 40, 0x888888, 5);
                        }
                    });
                }
                this.scene.time.delayedCall(2000, () => {
                    webLine.destroy();
                    this.isMiningWithPickaxe = false;
                    this.endCasting(0);
                });
            }
        });
    }

    endCasting(delay) {
        if (!this.scene || this.isDead) return;
        this.track(this.scene.time.delayedCall(delay, () => {
            if (this.active && this.hp > 0 && !this.isReviving && !this.isDead) {
                this.isCasting = false;
                this.isDashing = false;
                this.isZipping = false;
                this.zipStep = 0;
                this.body.setAllowGravity(true); 
                this.rotation = 0; 
                this.setFlipY(false); 
                if (this.zipGraphics) { this.zipGraphics.destroy(); this.zipGraphics = null; }
            }
        }));
    }

    toxicVenomPuddles() {
        this.isCasting = true;
        this.body.setVelocity(0,0);
        this.safePlay('anim_boss_attack', true);
        let dir = this.player.x < this.x ? -1 : 1; 

        this.track(this.scene.time.delayedCall(400, () => {
            if (!this.active || this.isDead) return;

            this.scene.sound.play('snd_venom_spit', { volume: 0.6 });
            
            for (let i = 0; i < 4; i++) {
                let venom = this.track(this.scene.add.circle(this.x + (dir * 80), this.y + 30, 15, 0x00ff00));
                venom.setDepth(11);
                this.scene.physics.add.existing(venom);
                
                venom.body.setVelocityX(dir * (400 + (i * 150))); 
                venom.body.setVelocityY(-200); 
                venom.body.setAllowGravity(true);
                
                this.scene.physics.add.collider(venom, this.platforms, () => {
                    if (venom.active) {
                        let puddle = this.track(this.scene.add.ellipse(venom.x, venom.y + 5, 20, 15, 0x00ff00, 0.7));
                        puddle.setDepth(8);
                        this.scene.physics.add.existing(puddle);
                        puddle.body.setAllowGravity(false);
                        puddle.body.setImmovable(true);
                        this.toxicPuddles.add(puddle);
                        
                        this.scene.tweens.add({ targets: puddle, scaleX: 8, duration: 300, ease: 'Cubic.easeOut' });
                        this.scene.tweens.add({ targets: puddle, alpha: 0.3, yoyo: true, repeat: -1, duration: 600, delay: 300 });
                        
                        venom.destroy();

                        this.track(this.scene.time.delayedCall(10000, () => {
                            if (puddle.active) this.scene.tweens.add({ targets: puddle, alpha: 0, duration: 500, onComplete: () => puddle.destroy() });
                        }));
                    }
                });
            }
        }));
        this.endCasting(1200);
    }

    spitStickyWebs() {
        this.isCasting = true;
        this.body.setVelocity(0,0);
        this.safePlay('anim_boss_attack', true);
        let dir = this.player.x < this.x ? -1 : 1; 

        let spawnX = this.x + (dir * 80);
        let spawnY = this.y + 10; 

        let blastRing = this.scene.add.circle(spawnX, spawnY, 10, 0xffffff, 0.6).setDepth(13);
        this.scene.tweens.add({
            targets: blastRing,
            scaleX: 5,
            scaleY: 2.5,
            alpha: 0,
            duration: 250,
            onComplete: () => blastRing.destroy()
        });

        this.track(this.scene.time.delayedCall(300, () => {
            if (!this.active || this.isDead) return;

            this.scene.sound.play('snd_web_shoot', { volume: 0.5 });
            
            for (let i = 0; i < 6; i++) {
                this.track(this.scene.time.delayedCall(i * 100, () => {
                    if (!this.active || this.isDead) return;

                    let webProjectile = this.track(this.scene.add.circle(spawnX, spawnY, 6, 0xffffff));
                    webProjectile.setDepth(11);
                    this.scene.physics.add.existing(webProjectile);
                    webProjectile.body.setAllowGravity(false);
                    
                    this.scene.physics.moveToObject(webProjectile, this.player, Phaser.Math.Between(1100, 1600));
                    
                    let trajectoryAngle = Math.atan2(webProjectile.body.velocity.y, webProjectile.body.velocity.x);
                    
                    let trailLine = this.scene.add.rectangle(webProjectile.x, webProjectile.y, 30, 3, 0xffffff, 0.4).setDepth(10);
                    trailLine.setRotation(trajectoryAngle);
                    
                    let trailUpdate = this.scene.time.addEvent({
                        delay: 16,
                        loop: true,
                        callback: () => {
                            if (webProjectile.active && trailLine.active) {
                                trailLine.setPosition(
                                    webProjectile.x - (Math.cos(trajectoryAngle) * 15), 
                                    webProjectile.y - (Math.sin(trajectoryAngle) * 15)
                                );
                            } else {
                                trailLine.destroy();
                                trailUpdate.remove();
                            }
                        }
                    });

                    this.scene.physics.add.overlap(this.player, webProjectile, () => {
                        if (webProjectile.active) {
                            webProjectile.destroy();
                            this.playerHitCallback(this.player, this); 
                            
                            this.scene.cameras.main.shake(150, 0.015);
                            this.player.setTint(0x00ffff);
                            this.player.isWebStunned = true; 
                            
                            this.scene.time.delayedCall(1500, () => {
                                this.player.isWebStunned = false;
                                this.player.clearTint();
                            });
                        }
                    });

                    this.scene.time.delayedCall(150, () => {
                        if (webProjectile.active && this.scene) {
                            this.scene.physics.add.collider(webProjectile, this.platforms, () => {
                                if (webProjectile.active) {
                                    this.createDestructibleWeb(webProjectile.x, webProjectile.y);
                                    webProjectile.destroy();
                                }
                            });
                        }
                    });

                    this.track(this.scene.time.delayedCall(2000, () => { if(webProjectile.active) webProjectile.destroy(); }));
                }));
            }
        }));
        this.endCasting(1200);
    }

    dynamicWebZip() {
        this.isCasting = true;
        this.isZipping = true;
        this.zipStep = 1; 
        this.safePlay('anim_boss_run', true);
        
        this.zipTargetY = this.player.y - 10; 
        this.zipTargetX = this.player.x; 
        
        this.body.setAllowGravity(false);
        this.surface = 'air'; 
        
        let dirY = this.zipTargetY > this.y ? 1 : -1;
        this.body.setVelocity(0, dirY * 1800);
        this.angle = dirY === 1 ? 180 : 0; 
        this.setFlipX(false);
        this.setFlipY(false);

        if (this.zipGraphics) { this.zipGraphics.destroy(); }
        this.zipGraphics = this.scene.add.graphics();
        this.zipGraphics.setDepth(11);
        this.track(this.zipGraphics);

        if (this.zipTimer) this.zipTimer.remove();
        this.zipTimer = this.scene.time.delayedCall(2000, () => { if (this.isZipping) this.endCasting(0); });
    }

    bungeeDrop() {
        this.isCasting = true;
        this.body.setVelocity(0,0);
        
        let startY = this.y; 
        let targetY = this.y + 400;

        let warnBox = this.track(this.scene.add.rectangle(this.x, startY + 300, 150, 600, 0xff0000, 0.4));
        warnBox.setDepth(10);
        this.scene.tweens.add({ targets: warnBox, alpha: 0.1, yoyo: true, repeat: 3, duration: 150 });

        this.track(this.scene.time.delayedCall(600, () => {
            if (warnBox) warnBox.destroy();
            if (!this.active || this.isDead) return;
            
            this.safePlay('anim_boss_attack', true);
            this.angle = 180; 
            
            let threadGraphics = this.scene.add.graphics();
            this.track(threadGraphics);

            this.scene.tweens.add({
                targets: this,
                y: targetY,
                duration: 350,
                ease: 'Power2',
                onUpdate: () => { 
                    if(threadGraphics.active) {
                        threadGraphics.clear();
                        threadGraphics.lineStyle(4, 0xffffff, 1);
                        threadGraphics.beginPath();
                        threadGraphics.moveTo(this.x, startY);
                        threadGraphics.lineTo(this.x, this.y);
                        threadGraphics.strokePath();
                    }
                },
                onComplete: () => {
                    this.track(this.scene.time.delayedCall(1500, () => { 
                        if (!this.active || this.isDead) return;
                        this.scene.tweens.add({
                            targets: this,
                            y: startY,
                            duration: 500,
                            onUpdate: () => { 
                                if(threadGraphics.active) {
                                    threadGraphics.clear();
                                    threadGraphics.lineStyle(4, 0xffffff, 1);
                                    threadGraphics.beginPath();
                                    threadGraphics.moveTo(this.x, startY);
                                    threadGraphics.lineTo(this.x, this.y);
                                    threadGraphics.strokePath();
                                }
                            },
                            onComplete: () => { if(threadGraphics) threadGraphics.destroy(); this.endCasting(0); }
                        });
                    }));
                }
            });
        }));
    }

    getIsDashing() {
        return this.isDashing;
    }

    grapplePull() {
        this.isCasting = true;
        this.body.setVelocity(0,0);
        this.safePlay('anim_boss_attack', true);

        let dir = this.surface === 'right_wall' ? -1 : 1;
        
        let warnBox = this.track(this.scene.add.rectangle(this.x + (dir * 600), this.y, 1200, 80, 0xff0000, 0.4));
        warnBox.setDepth(10);
        this.scene.tweens.add({ targets: warnBox, alpha: 0.1, yoyo: true, repeat: 3, duration: 150 });

        this.track(this.scene.time.delayedCall(600, () => {
            if (warnBox) warnBox.destroy();
            if (!this.active || this.isDead) return;

            let hook = this.track(this.scene.add.rectangle(this.x, this.y, 120, 50, 0xffffff));
            hook.setDepth(11);
            this.scene.physics.add.existing(hook);
            hook.body.setAllowGravity(false);
            hook.body.setVelocityX(dir * 1800); 

            this.scene.physics.add.overlap(this.player, hook, () => {
                if (hook.active) {
                    hook.destroy();
                    
                    this.player.body.setVelocityX((dir === 1 ? -1 : 1) * 1200); 
                    this.player.body.setVelocityY(-350); 
                    
                    this.player.setTintFill(0xffffff);
                    this.player.isCocooned = true; 
                    
                    this.scene.time.delayedCall(1500, () => { 
                        this.player.clearTint();
                        this.player.isCocooned = false; 
                    });

                    this.isCasting = false; 
                    this.surface = 'floor'; 
                    this.body.setAllowGravity(true);
                    this.frenzyCharge(); 
                }
            });

            this.track(this.scene.time.delayedCall(1000, () => { if (hook.active) { hook.destroy(); this.endCasting(0); } }));
        }));
    }

    layEggSac() {
        this.isCasting = true;
        this.body.setVelocity(0,0);
        this.safePlay('anim_boss_attack', true);

        this.track(this.scene.time.delayedCall(500, () => {
            if (!this.active || this.isDead) return;

            this.scene.sound.play('snd_egg_lay', { volume: 0.6 });
            
            let egg = this.track(this.scene.add.ellipse(this.x, this.y - 20, 80, 100, 0x00ff00)); 
            egg.setDepth(10);
            this.scene.physics.add.existing(egg);
            egg.body.setAllowGravity(false);
            egg.body.setImmovable(true);
            
            this.scene.tweens.add({ targets: egg, scale: 1.2, duration: 300, yoyo: true, repeat: -1 });

            if (typeof bullets !== 'undefined') {
                this.scene.physics.add.overlap(bullets, egg, (b, e) => {
                    b.destroy();
                    this.spawnDebris(e.x, e.y, 0x00ff00, 10);
                    e.destroy();
                });
            }

            this.track(this.scene.time.delayedCall(4000, () => {
                if (!egg.active) return; 
                
                this.spawnDebris(egg.x, egg.y, 0x00ff00, 15);
                
                for(let i=0; i<5; i++) { 
                    let spd = this.track(this.scene.add.rectangle(egg.x + (i*20 - 40), egg.y, 25, 25, 0x800080));
                    spd.setDepth(11);
                    this.scene.physics.add.existing(spd);
                    spd.body.setCollideWorldBounds(true);
                    spd.body.setVelocity(Phaser.Math.Between(-400, 400), -300);
                    
                    spd.dir = Math.random() > 0.5 ? 1 : -1;
                    this.track(this.scene.time.addEvent({ 
                        delay: 100, 
                        callback: () => { 
                            if(spd.active) {
                                spd.body.setVelocityX(250 * spd.dir);
                                if(spd.body.blocked.left) spd.dir = 1;
                                if(spd.body.blocked.right) spd.dir = -1;
                            } 
                        }, loop: true 
                    }));
                    
                    this.scene.physics.add.overlap(this.player, spd, () => {
                        if (spd.active) { this.playerHitCallback(this.player, spd); spd.destroy(); }
                    });
                    
                    this.track(this.scene.time.delayedCall(6000, () => { if(spd.active) spd.destroy(); }));
                }
                egg.destroy();
            }));

            this.endCasting(500);
        }));
    }

    frenzyCharge() {
        this.isCasting = true;
        this.isDashing = true; 
        this.body.setVelocity(0, 0); 
        
        let dirX = this.player.x > this.x ? 1 : -1;
        
        // OVERRIDE SAFEGUARD: If she hits a corner boundary wall, force target lunge vector back inside the map layout plane
        if (this.body.blocked.left) dirX = 1;
        if (this.body.blocked.right) dirX = -1;
        
        if (this.underPlatformEscaping) {
            dirX = this.escapeDirX; 
        } else if (Math.abs(this.player.x - this.x) < 6 && !this.body.blocked.left && !this.body.blocked.right) {
            dirX = this.lastFacingLeft ? -1 : 1;
        }

        let warnBox = this.track(this.scene.add.rectangle(
            this.x + (dirX * 800), this.y, 1600, 100, 0xff0000, 0.3
        ));
        warnBox.setDepth(10);
        this.scene.tweens.add({ targets: warnBox, alpha: 0.1, yoyo: true, repeat: 3, duration: 150 });

        this.track(this.scene.time.delayedCall(600, () => {
            if (warnBox) warnBox.destroy();
            if (!this.active || this.isDead) return;

            this.scene.sound.play('snd_boss_dash', { volume: 0.7 });

            this.body.setVelocityX(dirX * 1100); 
            this.scene.cameras.main.shake(600, 0.015);

            let dashFxEvent = this.scene.time.addEvent({ 
                delay: 40, 
                loop: true,
                callback: () => { 
                    if (!this.active || !this.isDashing) {
                        dashFxEvent.remove();
                        return;
                    }
                    
                    let ghost = this.scene.add.sprite(this.x, this.y, this.texture.key, this.frame.name);
                    ghost.setScale(this.scaleX); 
                    ghost.setFlipX(this.flipX);
                    ghost.angle = this.angle;
                    ghost.setDepth(11);
                    
                    ghost.setTint(Math.random() > 0.5 ? 0x00ffff : 0xff00ff);
                    ghost.alpha = 0.6;
                    
                    ghost.x += Phaser.Math.Between(-15, 15);
                    ghost.y += Phaser.Math.Between(-15, 15);

                    this.scene.tweens.add({
                        targets: ghost,
                        alpha: 0,
                        scaleX: this.scaleX + 0.5,
                        scaleY: this.scaleY + 0.5,
                        duration: 300,
                        onComplete: () => ghost.destroy()
                    });

                    if (Math.random() > 0.5 && !this.animLock) {
                        this.setTintFill(0xffffff);
                    } else if (!this.animLock) {
                        this.clearTint();
                    }
                }
            });
            this.track(dashFxEvent);
            
            this.track(this.scene.time.delayedCall(600, () => { 
                this.isDashing = false;
                this.body.setVelocityX(0); 
                this.body.setAllowGravity(true);
                this.scene.physics.collide(this, this.scene.platforms);
                if (!this.animLock) this.clearTint(); 

                if (this.lives === 1 && this.dashChainCount < 2 && !this.underPlatformEscaping) {
                    this.dashChainCount++;
                    this.frenzyCharge(); 
                    return;
                }
                this.dashChainCount = 0; 
                this.endCasting(0); 

                if (this.underPlatformEscaping) {
                    this.underPlatformEscaping = false;
                    
                    this.surface = 'air';
                    this.body.setAllowGravity(true);
                    
                    this.body.setVelocityY(-550); 
                    this.body.setVelocityX(dirX * 450); 
                    this.unstuckCooldown = 400; 

                    this.scene.time.delayedCall(150, () => {
                        if (this.active && !this.isDead && !this.isZipping && this.y > this.player.y) {
                            this.dynamicWebZip(); 
                        }
                    });
                }
            }));
        }));
    }

    silkSkyBarrage() {
        this.isCasting = true;
        this.body.setVelocity(0, 0);
        this.safePlay('anim_boss_attack', true);
        
        this.angle = this.lastFacingLeft ? 45 : -45; 

        for (let i = 0; i < 3; i++) {
            this.scene.time.delayedCall(i * 600, () => {
                if (!this.active || this.isDead) return;

                let targetX = this.player.x;
                let groundY = 575; 

                let warnLine = this.scene.add.rectangle(targetX, groundY, 70, 10, 0xff0000, 0.6).setDepth(10);
                this.scene.tweens.add({ targets: warnLine, alpha: 0.1, yoyo: true, repeat: 2, duration: 150 });

                this.spawnDebris(this.x, this.y - 20, 0xffffff, 6);

                this.scene.time.delayedCall(500, () => {
                    if (warnLine) warnLine.destroy();
                    if (!this.scene || this.isDead) return;

                    this.scene.sound.play('snd_web_shoot', { volume: 0.5 });

                    let mortarWeb = this.track(this.scene.add.circle(targetX, this.y - 500, 25, 0xffffff)).setDepth(11);
                    this.scene.physics.add.existing(mortarWeb);
                    mortarWeb.body.setVelocityY(1300);
                    mortarWeb.body.setAllowGravity(false);

                    this.scene.physics.add.overlap(this.player, mortarWeb, () => {
                        if (mortarWeb.active) {
                            mortarWeb.destroy();
                            this.playerHitCallback(this.player, this);
                            this.player.body.setVelocityX(0); 
                        }
                    });

                    this.scene.physics.add.collider(mortarWeb, this.platforms, () => {
                        if (mortarWeb.active) {
                            this.createDestructibleWeb(mortarWeb.x, mortarWeb.y);
                            mortarWeb.destroy();
                        }
                    });
                });
            });
        }

        this.scene.time.delayedCall(2000, () => {
            this.angle = 0;
            this.endCasting(0);
        });
    }

    desperationWebStorm() {
        this.isCasting = true;
        this.body.setVelocity(0, 0);
        this.safePlay('anim_boss_attack', true);
        
        this.setTintFill(0xffffff);
        this.scene.cameras.main.shake(300, 0.02);
        this.scene.time.delayedCall(250, () => this.clearTint());

        this.track(this.scene.time.delayedCall(400, () => {
            if (!this.active || this.isDead) return;

            let totalProjectiles = 12;
            for (let i = 0; i < totalProjectiles; i++) {
                let angle = (i / totalProjectiles) * Math.PI * 2; 
                
                let spawnX = this.x + (Math.cos(angle) * 60);
                let spawnY = this.y + (Math.sin(angle) * 60);

                let stormWeb = this.track(this.scene.add.circle(spawnX, spawnY, 15, 0xffffff)).setDepth(11);
                this.scene.physics.add.existing(stormWeb);
                stormWeb.body.setAllowGravity(false);

                let webSpeed = 850;
                stormWeb.body.setVelocityX(Math.cos(angle) * webSpeed);
                stormWeb.body.setVelocityY(Math.sin(angle) * webSpeed);

                let trail = this.scene.add.rectangle(spawnX, spawnY, 35, 4, 0xffffff, 0.5).setDepth(10);
                trail.setRotation(angle);

                let trailTimer = this.scene.time.addEvent({
                    delay: 16, loop: true,
                    callback: () => {
                        if (stormWeb.active && trail.active) {
                            trail.setPosition(stormWeb.x - (Math.cos(angle) * 15), stormWeb.y - (Math.sin(angle) * 15));
                        } else {
                            trail.destroy();
                            trailTimer.remove();
                        }
                    }
                });

                this.scene.physics.add.overlap(this.player, stormWeb, () => {
                    if (stormWeb.active) {
                        stormWeb.destroy();
                        this.playerHitCallback(this.player, this);
                        
                        this.player.setTint(0x00ffff);
                        this.player.isWebStunned = true;
                        this.scene.time.delayedCall(1500, () => {
                            this.player.isWebStunned = false;
                            this.player.clearTint();
                        });
                    }
                });

                this.scene.physics.add.collider(stormWeb, this.platforms, () => {
                    if (stormWeb.active) {
                        this.createDestructibleWeb(stormWeb.x, stormWeb.y);
                        stormWeb.destroy();
                    }
                });
            }
        }));

        this.endCasting(1500);
    }

    detectVibrations(player) {
        if (this.isCasting || this.isDashing || this.isDead || this.isReviving) return;

        let playerIsOnWeb = false;
        this.scene.physics.overlap(player, this.stickyWebs, () => { playerIsOnWeb = true; });

        if (playerIsOnWeb && (Math.abs(player.body.velocity.x) > 100 || player.body.velocity.y < -10)) {
            this.skitterBoost = 2.8; 
            if (!this.animLock) this.setTint(0xff3333); 
            if (Math.random() < 0.04) {
                this.frenzyCharge(); 
            }
        } else if (!this.animLock && !this.isDashing) {
            this.clearTint();
        }
    }

    executeMolt() {
        if (this.hasMolted || this.lives > 1 || this.hp > this.maxHealth * 0.5 || this.isDead) return;
        this.hasMolted = true;

        let husk = this.scene.add.sprite(this.x, this.y, this.texture.key, 'boss_idle');
        husk.setScale(4);
        husk.setTint(0x444444);
        husk.setAlpha(0.7);
        husk.setDepth(11);

        this.scene.cameras.main.flash(500, 255, 0, 255);
        this.scene.cameras.main.shake(500, 0.03);
        this.spawnDebris(this.x, this.y, 0x444444, 30);

        this.setDisplaySize(65, 65);    
        this.body.setSize(50, 50);
        this.body.setOffset(5, 2);   
        this.alpha = 0.55;         
        this.moveSpeed += 90;    

        this.scene.physics.add.existing(husk);
        husk.body.setImmovable(true);
        husk.body.setAllowGravity(false);
        this.scene.physics.add.collider(this.player, husk);

        this.scene.time.delayedCall(5000, () => {
            if (this.scene && this.active) {
                this.scene.tweens.add({ targets: husk, alpha: 0, duration: 1000, onComplete: () => husk.destroy() });
            }
        });
    }

    webBombardment() {
        this.isCasting = true;
        this.body.setVelocity(0,0);
        this.safePlay('anim_boss_attack', true);
        this.setFlipY(true); 

        let oldPos = (this.playerHistory && this.playerHistory.length > 0) 
        ? this.playerHistory[0] 
        : {x: this.player.x, y: this.player.y};

        let flash = this.scene.add.circle(this.x, this.y, 50, 0xffffff, 0.6);
        this.scene.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 500, onComplete: () => flash.destroy()});

        this.track(this.scene.time.delayedCall(500, () => {
            if (!this.active || this.isDead) return;

            this.scene.sound.play('snd_web_shoot', { volume: 0.5 });

            let dropPoints = [
    oldPos.x, 
    Phaser.Math.Between(1750, 2100), // 对应 32px 竞技场左侧天花板
    Phaser.Math.Between(2200, 2600), // 对应 32px 竞技场中部天花板
    Phaser.Math.Between(2700, 3050)  // 对应 32px 竞技场右侧天花板
];

            dropPoints.forEach(x => {
                let warn = this.track(this.scene.add.rectangle(x, 400, 64, 400, 0xff0000, 0.2)); 
                warn.setDepth(10);
                this.scene.tweens.add({targets: warn, alpha: 0.6, duration: 150, yoyo: true, repeat: 4});
                this.track(this.scene.time.delayedCall(800, () => {
                    if (warn) warn.destroy();
                    if (!this.scene || this.isDead) return;
                    let webDrop = this.track(this.scene.add.circle(x, 150, 20, 0xffffff)); webDrop.setDepth(11);
                    this.scene.physics.add.existing(webDrop); webDrop.body.setVelocityY(800); 
                    this.scene.physics.add.overlap(this.player, webDrop, () => { if (webDrop.active) { webDrop.destroy(); this.playerHitCallback(this.player, this); } }, null, this.scene);
                    this.scene.physics.add.collider(webDrop, this.platforms, () => { if (webDrop.active) { this.createDestructibleWeb(webDrop.x, webDrop.y); webDrop.destroy(); } });
                    this.track(this.scene.time.delayedCall(2000, () => { if(webDrop.active) webDrop.destroy(); }));
                }));
            });
        }));

        this.track(this.scene.time.delayedCall(1800, () => {
            this.setFlipY(false); 
            this.endCasting(0);
        }));
    }

    createDestructibleWeb(x, y) {
        if (!this.active || this.isDead || !this.scene) return;
        let web = this.track(this.scene.add.ellipse(x, y - 12, 60, 20, 0xaaaaaa, 0.8)); web.setDepth(9); 
        this.scene.physics.add.existing(web); web.body.setAllowGravity(false); web.body.setImmovable(true); this.stickyWebs.add(web); 
        this.scene.tweens.add({ targets: web, alpha: 0.4, scaleX: 1.1, yoyo: true, repeat: -1, duration: 600 });
        if (typeof bullets !== 'undefined') {
            this.scene.physics.add.overlap(bullets, web, (bulletObj, webObj) => {
                bulletObj.destroy(); let pop = this.scene.add.circle(webObj.x, webObj.y, 50, 0xffffff); pop.setDepth(10);
                this.scene.tweens.add({ targets: pop, alpha: 0, scale: 1.5, duration: 200, onComplete: () => pop.destroy() });
                webObj.destroy(); 
            }, null, this.scene);
        }

        this.track(this.scene.time.delayedCall(15000, () => { if (web.active) this.scene.tweens.add({ targets: web, alpha: 0, duration: 500, onComplete: () => web.destroy() }); }));
    }

    spawnDebris(x, y, color, count) {
        if (!this.scene) return;
        for (let i = 0; i < count; i++) {
            let chunk = this.scene.add.rectangle(x, y, Phaser.Math.Between(4, 8), Phaser.Math.Between(4, 8), color); chunk.setDepth(12);
            this.scene.physics.add.existing(chunk); chunk.body.setVelocity(Phaser.Math.Between(-200, 200), Phaser.Math.Between(-300, -100));
            this.scene.tweens.add({ targets: chunk, alpha: 0, duration: Phaser.Math.Between(500, 1000), onComplete: () => { if (chunk) chunk.destroy(); } });
        }
    }

    showDamageNumber(amount) {
        if (!this.scene) return;
        let txt = this.scene.add.text(this.x + Phaser.Math.Between(-30, 30), this.y - 50, `-${amount}`, { fontSize: '24px', fill: '#ffff00', fontFamily: 'Courier', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setDepth(200);
        this.scene.tweens.add({ targets: txt, y: txt.y - 60, alpha: 0, scale: 1.5, duration: 800, ease: 'Cubic.easeOut', onComplete: () => { if(txt) txt.destroy(); } });
    }

    forceUnstuckJump() {
        this.surface = 'air';
        this.body.setAllowGravity(true);
        this.angle = 0;
        this.rotation = 0;
        this.isZipping = false;
        this.isCasting = false;

        let dirX = this.player.x > this.x ? 1 : -1;
        this.x += dirX * 30;

        this.body.setVelocityY(-450); 
        this.body.setVelocityX(dirX * 500); 
        
        this.unstuckCooldown = 400; 

        this.spawnDebris(this.x, this.y, 0x00ffff, 15);
        this.safePlay('anim_boss_run', true);
    }

    takeDamage(amount = 1) {
        if (!this.active || this.hp <= 0 || this.isReviving || this.isDead) return;
        this.hp -= amount; 

        this.scene.sound.play('snd_boss_hurt', { volume: 0.1 });

        if (this.healthBar && this.healthBar.active) { this.healthBar.width = (this.hp / this.maxHealth) * 600; }

        if (this.lives === 1) {
            this.executeMolt();
        }

        if (!this.isCasting && !this.isDashing) { 
            this.animLock = true; 
            this.safePlay('anim_boss_hurt', true); 
            this.scene.time.delayedCall(200, () => { this.animLock = false; }); 
        }
        
        for(let i=0; i<8; i++){
            let drop = this.scene.add.circle(this.x, this.y, Phaser.Math.Between(3,6), 0xff00ff); 
            drop.setDepth(11); 
            this.scene.physics.add.existing(drop);
            drop.body.setBounce(0.5); 
            drop.body.setCollideWorldBounds(true); 
            drop.body.setVelocity(Phaser.Math.Between(-300, 300), Phaser.Math.Between(-300, -100));
            this.scene.tweens.add({targets: drop, alpha: 0, duration: 1200, ease: 'Power2', onComplete: ()=>drop.destroy()}); 
            this.scene.physics.add.collider(drop, this.platforms);
        }
        this.showDamageNumber(amount);

        if (this.hp <= 0) { if (this.lives > 1) { this.triggerReviveSequence(); } else { this.triggerDeathSequence(); } }
    }

    update(time, delta, player) {

        // 在 boss.js 的 update(time, delta, player) 最开头添加：
if (this.body) {
    // 强制每帧检查她是否与地板相交，如果因为技能进入了半空，立刻强制锁定到平台
    this.scene.physics.collide(this, this.platforms);
    this.scene.physics.collide(this, this.scene.walls);
}

        if (!this.active || this.hp <= 0 || this.isReviving || this.isDead) return;

        // 🌟 ANTI-DROP ARMOR: Force floor snap if not flying
        if (this.surface === 'floor' && this.body) {
            if (!this.isDashing && !this.isZipping && !this.isCasting) {
                 this.body.setAllowGravity(true);
            }
        }

        this.detectVibrations(player);

        if (this.unstuckCooldown > 0) {
            this.unstuckCooldown -= delta;
            return; 
        }

        this.playerHistory.push({x: player.x, y: player.y, time: time});
        if (this.playerHistory.length > 30) this.playerHistory.shift(); 
        this.playerHistory = this.playerHistory.filter(p => time - p.time <= 500);

        // --- TIME-SAMPLED POSITION WATCHDOG MATRIX ---
        this.stuckCheckTimer += delta;
        if (this.stuckCheckTimer > 500) { 
            let netDistanceMoved = Phaser.Math.Distance.Between(this.x, this.y, this.lastStuckX, this.lastStuckY);
            
            if (netDistanceMoved < 20) {
                this.timeSpentStuck += 500;
                
                if (this.timeSpentStuck >= 500 && !this.isCasting && !this.isDashing && !this.isZipping) {
                    
                    if (player.y > this.y + 60) {
                        this.frenzyCharge(); 
                    } 
                    else if (player.y < this.y - 60 && Math.abs(this.x - player.x) < 200) {
                        this.underPlatformEscaping = true;
                        this.escapeDirX = player.x >= this.x ? 1 : -1; 
                        this.frenzyCharge(); 
                    }
                    else {
                        this.forceUnstuckJump(); 
                    }
                    this.timeSpentStuck = 0;
                }
            } else {
                this.timeSpentStuck = 0;
            }
            
            this.lastStuckX = this.x;
            this.lastStuckY = this.y;
            this.stuckCheckTimer = 0;
        }

        this.venomCD -= delta;
        this.scene.physics.overlap(this.player, this.toxicPuddles, () => {
            if (!this.player.isCocooned) { 
                this.player.body.velocity.x *= 0.4; 
                this.player.setTint(0x00ff00); 
                if (this.venomCD <= 0) { this.playerHitCallback(this.player, this); this.venomCD = 1000; } 
            }
        });

        let isStuck = false; this.scene.physics.overlap(this.player, this.stickyWebs, () => { isStuck = true; });
        let pDashing = (typeof isDashing !== 'undefined') ? isDashing : false;
        if ((isStuck || this.player.isWebStunned) && !pDashing && !this.player.isCocooned) {
            this.player.body.velocity.x *= 0.1; 
            if (this.player.body.velocity.y < 0) this.player.body.velocity.y *= 0.3; 
            this.player.setTint(0x00ffff);
        } else if (!this.isDashing && !this.animLock && !this.player.isCocooned && this.venomCD <= 0 && !this.player.isWebStunned) { this.player.clearTint(); }

        if (this.isZipping && this.zipGraphics) {
            this.zipGraphics.clear(); this.zipGraphics.lineStyle(6, 0xffffff, 1); this.zipGraphics.beginPath();

            if (this.zipStep === 1) {
                this.zipGraphics.moveTo(this.x, this.y); this.zipGraphics.lineTo(this.x, this.zipTargetY); this.zipGraphics.strokePath();
                if (Phaser.Math.Distance.Between(this.x, this.y, this.x, this.zipTargetY) <= 25 || this.body.blocked.up || this.body.blocked.down) {
                    this.body.setVelocity(0, 0); if (!this.body.blocked.up && !this.body.blocked.down) this.y = this.zipTargetY; 
                    this.zipStep = 2; let dirX = this.zipTargetX > this.x ? 1 : -1; this.body.setVelocityX(dirX * 1800); this.angle = 0; 
                    let enterLeft = dirX === -1; this.setFlipX(enterLeft); this.lastFacingLeft = enterLeft;
                }
            } 
            else if (this.zipStep === 2) {
                this.zipGraphics.moveTo(this.x, this.y); this.zipGraphics.lineTo(this.zipTargetX, this.y); this.zipGraphics.strokePath();
                if (Phaser.Math.Distance.Between(this.x, this.y, this.zipTargetX, this.y) <= 25 || this.body.blocked.left || this.body.blocked.right) {
                    this.isZipping = false; this.isCasting = false; this.zipStep = 0; this.body.setVelocity(0, 0); this.body.setAllowGravity(true); this.rotation = 0;
                    if (this.zipGraphics) { this.zipGraphics.destroy(); this.zipGraphics = null; } if (this.zipTimer) this.zipTimer.remove();
                }
            }
            return; 
        }

        if (this.isCasting) {
            let deltaPlayerX = player.x - this.x;
            if (Math.abs(deltaPlayerX) > 80) { let checkLeft = deltaPlayerX < 0; if (checkLeft !== this.lastFacingLeft) { this.setFlipX(checkLeft); this.lastFacingLeft = checkLeft; } }
            return; 
        }

        if (this.surface !== 'air') {
            this.skitterTimer -= delta; 
            if (this.skitterTimer <= 0) {
                if (this.isSkittering) { this.isSkittering = false; this.skitterBoost = 1; this.skitterTimer = Phaser.Math.Between(1000, 2500); } 
                else { this.isSkittering = true; if (Math.random() < 0.15) { this.skitterBoost = 0; this.skitterTimer = Phaser.Math.Between(150, 400); } else { this.skitterBoost = 2.2; this.skitterTimer = Phaser.Math.Between(200, 500); } }
            }
        } else { this.skitterBoost = 1; }

        let speed = this.moveSpeed * this.skitterBoost; 

        let bDown = this.body.blocked.down || this.body.touching.down;
        let bUp = this.body.blocked.up || this.body.touching.up;
        let bLeft = this.body.blocked.left || this.body.touching.left;
        let bRight = this.body.blocked.right || this.body.touching.right;

        let targetX = player.x; 
        let targetY = Phaser.Math.Clamp(player.y, 150, 700);
        if ((this.surface === 'floor' || this.surface === 'ceiling') && Math.abs(player.y - this.y) > 120) { 
            targetX = this.x > 2112 ? 2560 : 1760; 
        }

        let moveDirX = 0;
        if (Math.abs(targetX - this.x) > 40) {
            moveDirX = (targetX > this.x) ? 1 : -1;
        } else if (this.surface === 'floor' || this.surface === 'ceiling') {
            this.body.setVelocityX(0); 
        }

        // 限制 Boss 的 Y 轴活动范围，不要让她去 Row 15 寻找目标
let moveDirY = (targetY > this.y + 20) ? 1 : (targetY < this.y - 20) ? -1 : 0;

        let deltaX = player.x - this.x;
        if (Math.abs(deltaX) > 80) { 
            let nearLeft = deltaX < 0;
            if (nearLeft !== this.lastFacingLeft) {
                this.setFlipX(nearLeft);
                this.lastFacingLeft = nearLeft;
            }
        }

        if (this.surface === 'floor' && moveDirX !== 0 && (bLeft || bRight)) {
            this.surface = bLeft ? 'left_wall' : 'right_wall';
        }

        if (this.surface === 'air') {
            this.angle = 0; this.rotation = 0; this.setFlipY(false); this.body.setAllowGravity(true);
            if (moveDirX !== 0 && !this.isZipping) {
                this.body.setVelocityX(moveDirX * speed * 0.8);
            }
            if (bDown && this.body.velocity.y >= 0) this.surface = 'floor'; 
            else if (bLeft && moveDirX === -1) this.surface = 'left_wall'; 
            else if (bRight && moveDirX === 1) this.surface = 'right_wall'; 
            else if (bUp) this.surface = 'ceiling';
        }
        else if (this.surface === 'floor') {
            this.angle = 0; this.setFlipY(false); this.body.setAllowGravity(true);
            if (moveDirX !== 0) this.body.setVelocityX(moveDirX * speed);
            if (bLeft && moveDirX === -1) { this.surface = 'left_wall'; this.y -= 8; } 
            else if (bRight && moveDirX === 1) { this.surface = 'right_wall'; this.y -= 8; } 
            else if (!bDown) { this.surface = 'air'; }
        }
        else if (this.surface === 'left_wall') {
            this.angle = 90; this.setFlipY(moveDirY === -1); this.body.setAllowGravity(false);
            this.body.setVelocityX(-150); this.body.setVelocityY(moveDirY * speed);
            if (!bLeft) { 
                this.surface = 'air'; this.body.setAllowGravity(true); this.angle = 0; 
                if (moveDirY === -1) { this.body.setVelocityY(-500); this.body.setVelocityX(-speed * 1.5); } 
            } 
            else if (moveDirY === 0 && targetX > this.x + 50) { this.surface = 'air'; this.body.setAllowGravity(true); this.body.setVelocityY(-300); this.body.setVelocityX(speed * 1.5); } 
            else if (bUp && moveDirY === -1) { this.surface = 'ceiling'; this.x += 8; } 
            else if (bDown && moveDirY === 1) { this.surface = 'floor'; this.x += 8; }
        }
        else if (this.surface === 'right_wall') {
            this.angle = -90; this.setFlipY(moveDirY === -1); this.body.setAllowGravity(false);
            this.body.setVelocityX(150); this.body.setVelocityY(moveDirY * speed);
            if (!bRight) { 
                this.surface = 'air'; this.body.setAllowGravity(true); this.angle = 0; 
                if (moveDirY === -1) { this.body.setVelocityY(-500); this.body.setVelocityX(speed * 1.5); } 
            } 
            else if (moveDirY === 0 && targetX < this.x - 50) { this.surface = 'air'; this.body.setAllowGravity(true); this.body.setVelocityY(-300); this.body.setVelocityX(-speed * 1.5); } 
            else if (bUp && moveDirY === -1) { this.surface = 'ceiling'; this.x -= 8; } 
            else if (bDown && moveDirY === 1) { this.surface = 'floor'; this.x -= 8; }
        }
        else if (this.surface === 'ceiling') {
            this.angle = 180; this.setFlipY(false); this.body.setAllowGravity(false);
            this.body.setVelocityY(-150); this.body.setVelocityX(moveDirX * speed);
            if (bLeft && moveDirX === -1) { this.surface = 'left_wall'; this.y += 8; } 
            else if (bRight && moveDirX === 1) { this.surface = 'right_wall'; this.y += 8; } 
            else if (!bUp) { this.surface = 'air'; }
        }

        // 🌟 修复每帧强行缩回 1.8 的 Bug，改用我们在上面定义的 this.baseScale 变量
        if ((this.body.velocity.x !== 0 || this.body.velocity.y !== 0) && this.track && this.skitterBoost > 0) {
            let legWasp = Math.sin(time * (0.02 * this.skitterBoost)) * 0.18;
            if (this.surface === 'left_wall' || this.surface === 'right_wall') { 
                this.scaleX = this.baseScale + legWasp; this.scaleY = this.baseScale; 
            } else { 
                this.scaleX = this.baseScale; this.scaleY = this.baseScale + legWasp; 
            }
        } else { 
            this.scaleX = this.baseScale; this.scaleY = this.baseScale; 
        }

        let distWalked = Phaser.Math.Distance.Between(this.x, this.y, this.lastWebX, this.lastWebY);
        if (distWalked >= 400 && this.surface !== 'air') { 
    this.createDestructibleWeb(this.x, this.y + (this.surface === 'ceiling' ? -12 : 12)); 
    this.lastWebX = this.x; 
    this.lastWebY = this.y; 
}

        if (!this.animLock) { if (this.skitterBoost === 0) { this.anims.pause(); } else { this.anims.resume(); this.safePlay('anim_boss_run', true); } }
    }

    triggerReviveSequence() {
        this.isReviving = true; this.isCasting = true; this.isDashing = false; this.isZipping = false; this.zipStep = 0; this.animLock = false; this.lives -= 1;
        this.clearAttacks(); this.body.setVelocity(0,0); this.body.setAllowGravity(true); this.surface = 'air'; this.angle = 0; this.rotation = 0; this.setFlipY(false); if (this.zipGraphics) { this.zipGraphics.destroy(); this.zipGraphics = null; } this.clearTint();
        this.safePlay('anim_boss_idle', true); 
        this.scene.sound.play('snd_boss_roar', { volume: 0.8 });
        this.scene.cameras.main.flash(1000, 255, 255, 255); this.scene.cameras.main.shake(1500, 0.05); this.spawnDebris(this.x, this.y, 0xffffff, 50);

        this.hp = this.maxHealth; if (this.healthBar && this.healthBar.active) this.healthBar.width = 600;
        if (this.bossNameText && this.bossNameText.active) {
            if (this.lives === 2) { 
                this.healthBar.setFillStyle(0xffff00); 
                this.bossNameText.setText(`THE CRYSTAL MATRIARCH - ENRAGED [LIVES: 2]`).setColor('#ffff00'); 
                this.moveSpeed = 340; 
                this.startAttackLoop(1800); 
            } 
            else if (this.lives === 1) { 
                this.healthBar.setFillStyle(0xff0000); 
                this.bossNameText.setText(`THE CRYSTAL MATRIARCH - DESPERATION [LIVES: 1]`).setColor('#ff0000'); 
                this.moveSpeed = 390;
                this.startAttackLoop(1300);
            }
        }
        this.track(this.scene.time.delayedCall(2000, () => { if (!this.active || this.isDead) return; this.isReviving = false; this.isCasting = false; this.startAttackLoop(this.lives === 2 ? 1800 : 1300); }));
    }

    triggerDeathSequence() {
        this.isDead = true; 
        this.isCasting = true; 
        this.isDashing = false; 
        this.isZipping = false; 
        this.zipStep = 0; 
        this.animLock = false;
        
        this.clearAttacks(); 
        this.body.setVelocity(0, 0); 
        this.body.setAllowGravity(true); 

        if (this.scene.currentBGM) {
        this.scene.currentBGM.stop();
    }
    this.scene.sound.play('snd_boss_dead', { volume: 0.7 });

    this.safePlay('anim_boss_dead', true);
        
        if (this.zipGraphics) { this.zipGraphics.destroy(); this.zipGraphics = null; }
        this.clearTint();
        
        this.safePlay('anim_boss_dead', true); 
        this.setTint(0x555555); 
        this.alpha = 1; 

        if (this.healthBar) this.healthBar.destroy(); 
        if (this.healthBarBg) this.healthBarBg.destroy(); 
        if (this.bossNameText) { 
            this.bossNameText.setText("MATRIARCH DEFEATED"); 
            this.bossNameText.setColor("#00ff00"); 
        }

        const cam = this.scene.cameras.main; 
        cam.stopFollow(); 
        cam.pan(this.x, this.y, 1000, 'Sine.easeInOut'); 
        cam.zoomTo(2.5, 800, 'Sine.easeInOut'); 

        this.deathLines = [
            "MATRIARCH: *Gasp... hiss*... The link... is breaking... my hold over the brood... is gone...",
            "MATRIARCH: The crystal's pulse... it slows... returning to normal dormant rock...",
            "MATRIARCH: You have... cleansed the infection at the heart of the nest...",
            "MATRIARCH: The abyss grows quiet... *Sigh*... The deep dark is finally... at peace... *Hssss...*"
        ];
        this.deathLineIndex = 0;
        this.nextAllowedClickTime = this.scene.time.now + 600; 

        // 🌟 修复：放大对白框到屏幕 80% 宽度，并优化文本对齐
    this.deathBoxBg = this.scene.add.rectangle(800, 800, 1400, 200, 0x000000, 0.95)
        .setStrokeStyle(4, 0xff0055)
        .setDepth(200)
        .setScrollFactor(0);

    this.deathText = this.scene.add.text(800, 800, '', { 
        fontSize: '32px', // 👈 字体放大到 32px
        fill: '#ffffff', 
        fontFamily: 'Courier', 
        fontStyle: 'bold', 
        align: 'center', 
        wordWrap: { width: 1300 } // 👈 增加换行宽度，让对白框能容纳更多文字
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
        this.deathPrompt = this.scene.add.text(800, 545, "[ CLICK MOUSE TO REVEAL FINAL MOMENTS ]", { fontSize: '30px', fill: '#ff0055', fontFamily: 'Courier', fontStyle: 'bold' }).setOrigin(0.5).setDepth(201).setScrollFactor(0);

        this.advanceDeathDialogueLine();
        
        this.deathClickListener = () => this.advanceDeathDialogueLine();
        this.scene.input.on('pointerdown', this.deathClickListener);
    }

    advanceDeathDialogueLine() {
        if (this.scene.time.now < this.nextAllowedClickTime) return;
        
        if (this.deathLineIndex < this.deathLines.length) {
            if (this.deathText && this.deathText.active) {
                this.deathText.setText(this.deathLines[this.deathLineIndex]);
            }
            this.scene.cameras.main.shake(200, 0.008);
            this.nextAllowedClickTime = this.scene.time.now + 350;
            this.deathLineIndex++;
        } else {
            this.scene.input.off('pointerdown', this.deathClickListener);
            
            if (this.deathBoxBg) this.deathBoxBg.destroy();
            if (this.deathText) this.deathText.destroy();
            if (this.deathPrompt) this.deathPrompt.destroy();

            this.executeFinalBodyExplosion();
        }
    }

    executeFinalBodyExplosion() {
        const gameScene = this.scene; 
        const cam = gameScene.cameras.main; 
        let originalX = this.x; 
        let originalY = this.y;

        gameScene.tweens.add({
            targets: this,
            scaleX: 5.5,
            scaleY: 5.5,
            angle: 720,
            duration: 1500,
            ease: 'Quad.easeIn',
            onUpdate: () => {
                this.setTintFill(Phaser.Math.RND.pick([0xffffff, 0xff0055, 0x00ffff]));
                this.alpha = 1;
                this.setPosition(originalX + Phaser.Math.Between(-15, 15), originalY + Phaser.Math.Between(-15, 15));
            },
            onComplete: () => {

                gameScene.sound.play('snd_boss_explode', { volume: 0.9 });

                cam.flash(1000, 255, 255, 255); 
                cam.shake(1200, 0.06);

                for (let i = 0; i < 90; i++) { 
                    let color = Phaser.Math.RND.pick([0xff00ff, 0x800080, 0xffffff, 0x00ffff]); 
                    let shard = gameScene.add.rectangle(originalX, originalY, Phaser.Math.Between(12, 35), Phaser.Math.Between(12, 35), color).setDepth(15);
                    gameScene.physics.add.existing(shard); 
                    shard.body.setVelocity(Phaser.Math.Between(-1400, 1400), Phaser.Math.Between(-1400, 1400)); 
                    shard.body.setAllowGravity(true);
                    
                    gameScene.tweens.add({ targets: shard, angle: 720, alpha: 0, duration: Phaser.Math.Between(1200, 2800), onComplete: () => shard.destroy() });
                }

                if (gameScene && gameScene.playerCanMove !== undefined) {
                    gameScene.playerCanMove = true;
                }

                cam.setBounds(1440, 0, 1760, 608);
                cam.startFollow(this.player, true, 0.05, 0.05);
                cam.zoomTo(2.0, 1200, 'Sine.easeInOut');

                let playerHealth = (typeof health !== 'undefined') ? health : 100;
                fetch('/api/game/save-progress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        bossDefeated: 'CrystalMatriarch',
                        checkpoint: 'SZ5_Cleared',
                        healthRemaining: playerHealth
                    })
                })
                .then(response => response.json())
                .then(data => console.log("Progress Saved:", data))
                .catch(error => console.error("Error saving progress:", error));

                this.destroy();
            }
        });
    }
}

const BossManager = {
    entity: null,
    spawn: function(scene, x, y, player, platforms, playerHitCallback, isIntro = false) {
        this.entity = new CrystalMatriarch(scene, x, y, player, platforms, playerHitCallback, isIntro);
        
        scene.physics.add.collider(this.entity, platforms);
        scene.physics.add.collider(this.entity, scene.walls); 
        
        this.entity.body.setCollideWorldBounds(true);
        this.entity.body.onWorldBounds = true;
        
        if (typeof sz_bossBarrier !== 'undefined') { 
            scene.physics.add.collider(this.entity, sz_bossBarrier); 
        }

        scene.physics.add.overlap(player, this.entity, () => { 
            if (this.entity && this.entity.active && this.entity.hp > 0) {
                playerHitCallback(player, this.entity); 
            }
        }, null, scene);
    },

    startFight: function() { 
        if (this.entity && this.entity.active) { 
            this.entity.startIntroRoar(); 
        } 
    },

    update: function(time, delta, player) { 
        if (this.entity && this.entity.active && this.entity.scene) { 
            this.entity.update(time, delta, player); 
        } 
    },

    takeDamage: function() { 
        if (this.entity && this.entity.active) { 
            this.entity.takeDamage(); 
        } 
    }
};
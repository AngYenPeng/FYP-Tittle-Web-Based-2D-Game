// --- GLOBAL VARIABLES (Accessible in both files) ---
let player, keys;
let currentLoot = 0, health = 1000, maxHealth = 1000, weaponLevel = 1;
let isFacingLeft = false, isDashing = false, canDash = true, isInvulnerable = false, canDoubleJump = false;
let healthText, dashBar, lootText;
let platforms, breakableWalls, enemies, bullets;
let respawnX = 150, respawnY = 150;

const worldChunks = {
    "start_area": [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,2,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ]
};

class SceneMain extends Phaser.Scene {
    constructor() {
        super('SceneMain'); // This is your main game level
    }

    preload() {}

    create() {
        this.physics.world.setBounds(0, 0, 3600, 1500);
        this.add.rectangle(0, 0, 4800, 3000, 0x1a1a2e).setOrigin(0,0);

        let pGraphics = this.make.graphics();
        pGraphics.fillStyle(0x00aaff); pGraphics.fillRect(0, 0, 30, 40);
        pGraphics.generateTexture('miner_img', 30, 40); pGraphics.destroy();

        let eGraphics = this.make.graphics();
        eGraphics.fillStyle(0xff0044); eGraphics.fillRect(0, 0, 30, 30);
        eGraphics.generateTexture('enemy_img', 30, 30); eGraphics.destroy();

        platforms = this.physics.add.staticGroup();
        enemies = this.physics.add.group();       
        bullets = this.physics.add.group();

        this.loadZone("start_area");

        player = this.physics.add.sprite(respawnX, respawnY, 'miner_img');
        player.setCollideWorldBounds(true); 
        this.cameras.main.startFollow(player, true, 0.05, 0.05);

        this.physics.add.collider(player, platforms);
        this.physics.add.collider(enemies, platforms);

        keys = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            enter: Phaser.Input.Keyboard.KeyCodes.ENTER // 🚨 Added ENTER key
        });

        healthText = this.add.text(20, 15, 'Health: 100%', { fontSize: '20px', fill: '#ffffff' }).setScrollFactor(0);
        
        // TEMPORARY INSTRUCTION FOR YOU:
        this.add.text(200, 200, "PRESS 'ENTER' TO TELEPORT TO BOSS LEVEL!", { fontSize: '30px', fill: '#ffff00' });
    }

    update() {
        // 🚨 TELEPORT TO BOSS SCENE 🚨
        // When you press ENTER, it stops this scene and loads SZ5!
        if (Phaser.Input.Keyboard.JustDown(keys.enter)) {
            this.scene.start('SceneSZ5');
        }

        let onGround = player.body.touching.down || player.body.blocked.down;

        if (keys.left.isDown) { player.body.setVelocityX(-400); isFacingLeft = true; } 
        else if (keys.right.isDown) { player.body.setVelocityX(400); isFacingLeft = false; } 
        else { player.body.setVelocityX(0); }

        if (Phaser.Input.Keyboard.JustDown(keys.up) && onGround) {
            player.body.setVelocityY(-400);
        }
    }

    loadZone(zoneName) {
        let layout = worldChunks[zoneName];
        const tileSize = 60;
        for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
                let xPos = c * tileSize + (tileSize / 2);
                let yPos = r * tileSize + (tileSize / 2);
                if (layout[r][c] === 1) { 
                    let block = this.add.rectangle(xPos, yPos, tileSize, tileSize, 0x553388);
                    this.physics.add.existing(block, true);
                    platforms.add(block);
                }
            }
        }
    }
}

// --- CONFIG AND START ---
// 🚨 Notice both scenes are loaded here! 🚨
const config = {
    type: Phaser.AUTO,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1066, height: 600 },
    physics: { default: 'arcade', arcade: { gravity: { y: 600 }, debug: false } },
    scene: [ SceneMain, SceneSZ5 ] 
};


// --- GLOBAL PLAYER LOGIC (Put this in game.js) ---

function updatePlayerLogic(scene, keys) {
    if (health <= 0) return;

    if (Phaser.Input.Keyboard.JustDown(keys.shift) && canDash && !isDashing) {
        executeDash(scene);
    }
    if (isDashing) return;

    let onGround = player.body.touching.down || player.body.blocked.down;
    if (onGround) canDoubleJump = true;

    if (keys.left.isDown) { 
        player.body.setVelocityX(-400); 
        isFacingLeft = true; 
    } else if (keys.right.isDown) { 
        player.body.setVelocityX(400); 
        isFacingLeft = false; 
    } else { 
        player.body.setVelocityX(0); 
    }
    
    if (Phaser.Input.Keyboard.JustDown(keys.up)) {
        if (onGround) {
            player.body.setVelocityY(-400);
        } else if (canDoubleJump) {
            player.body.setVelocityY(-400);
            canDoubleJump = false; 
        }
    }
}

function executeDash(scene) {
    isDashing = true;
    canDash = false;
    
    // Check if dashBar exists in the current scene before updating
    if (typeof dashBar !== 'undefined' && dashBar.active) {
        dashBar.width = 0;
        scene.tweens.add({ targets: dashBar, width: 100, duration: 1000 });
    }
    
    player.body.setAllowGravity(false);
    player.body.setVelocityY(0);
    player.body.setVelocityX(isFacingLeft ? -700 : 700);

    scene.time.delayedCall(250, () => {
        isDashing = false;
        player.body.setAllowGravity(true);
    });
    scene.time.delayedCall(1000, () => { canDash = true; });
}

function globalShootBullet(scene, pointer) {
    if (health <= 0) return;
    let bullet = scene.add.rectangle(player.x, player.y, 15, 5, 0xffff00);
    scene.physics.add.existing(bullet);
    bullets.add(bullet);
    
    let angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);
    bullet.body.setAllowGravity(false);
    scene.physics.velocityFromRotation(angle, 800, bullet.body.velocity);

    // If a boss exists in the scene, let the bullet hit it
    if (typeof BossManager !== 'undefined' && BossManager.entity && BossManager.entity.active) {
        scene.physics.add.overlap(bullet, BossManager.entity, (b) => {
            b.destroy(); 
            BossManager.takeDamage();
        });
    }
    
    scene.physics.add.collider(bullet, platforms, (b) => { b.destroy(); });
    scene.time.delayedCall(1500, () => { if (bullet.active) bullet.destroy(); });
}

function globalTouchHazard(playerObject, hazardObject) {
    if (health <= 0 || isInvulnerable || isDashing) return;
    health -= 50;
    
    if (typeof healthText !== 'undefined' && healthText.active) {
        healthText.setText('Health: ' + Math.ceil((health / maxHealth) * 100) + '%');
    }
    
    if (health <= 0) return;

    playerObject.body.setVelocityY(-300);
    playerObject.body.setVelocityX(isFacingLeft ? 250 : -250);

    isInvulnerable = true; 
    playerObject.setAlpha(0.5); 
    playerObject.scene.time.delayedCall(1000, () => {
        isInvulnerable = false;
        playerObject.setAlpha(1);
    });
}

// --- GLOBAL PLAYER LOGIC (Put this in game.js) ---

function updatePlayerLogic(scene, keys) {
    if (health <= 0) return;

    if (Phaser.Input.Keyboard.JustDown(keys.shift) && canDash && !isDashing) {
        executeDash(scene);
    }
    if (isDashing) return;

    let onGround = player.body.touching.down || player.body.blocked.down;
    if (onGround) canDoubleJump = true;

    if (keys.left.isDown) { 
        player.body.setVelocityX(-400); 
        isFacingLeft = true; 
    } else if (keys.right.isDown) { 
        player.body.setVelocityX(400); 
        isFacingLeft = false; 
    } else { 
        player.body.setVelocityX(0); 
    }
    
    if (Phaser.Input.Keyboard.JustDown(keys.up)) {
        if (onGround) {
            player.body.setVelocityY(-400);
        } else if (canDoubleJump) {
            player.body.setVelocityY(-400);
            canDoubleJump = false; 
        }
    }
}

function executeDash(scene) {
    isDashing = true;
    canDash = false;
    
    if (typeof dashBar !== 'undefined' && dashBar.active) {
        dashBar.width = 0;
        scene.tweens.add({ targets: dashBar, width: 100, duration: 1000 });
    }
    
    player.body.setAllowGravity(false);
    player.body.setVelocityY(0);
    player.body.setVelocityX(isFacingLeft ? -700 : 700);

    scene.time.delayedCall(250, () => {
        isDashing = false;
        player.body.setAllowGravity(true);
    });
    scene.time.delayedCall(1000, () => { canDash = true; });
}

function globalShootBullet(scene, pointer) {
    if (health <= 0) return;
    let bullet = scene.add.rectangle(player.x, player.y, 15, 5, 0xffff00);
    scene.physics.add.existing(bullet);
    bullets.add(bullet);
    
    let angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);
    bullet.body.setAllowGravity(false);
    scene.physics.velocityFromRotation(angle, 800, bullet.body.velocity);

    if (typeof BossManager !== 'undefined' && BossManager.entity && BossManager.entity.active) {
        scene.physics.add.overlap(bullet, BossManager.entity, (b) => {
            b.destroy(); 
            BossManager.takeDamage();
        });
    }
    
    scene.physics.add.collider(bullet, platforms, (b) => { b.destroy(); });
    scene.time.delayedCall(1500, () => { if (bullet.active) bullet.destroy(); });
}

function globalTouchHazard(playerObject, hazardObject) {
    if (health <= 0 || isInvulnerable || isDashing) return;
    health -= 50;
    
    if (typeof healthText !== 'undefined' && healthText.active) {
        healthText.setText('Health: ' + Math.ceil((health / maxHealth) * 100) + '%');
    }
    
    if (health <= 0) return;

    playerObject.body.setVelocityY(-300);
    playerObject.body.setVelocityX(isFacingLeft ? 250 : -250);

    isInvulnerable = true; 
    playerObject.setAlpha(0.5); 
    playerObject.scene.time.delayedCall(1000, () => {
        isInvulnerable = false;
        playerObject.setAlpha(1);
    });
}

const game = new Phaser.Game(config);
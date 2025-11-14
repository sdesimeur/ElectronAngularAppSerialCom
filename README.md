[![Angular Logo](https://www.vectorlogo.zone/logos/angular/angular-icon.svg)](https://angular.io/) [![Electron Logo](https://www.vectorlogo.zone/logos/electronjs/electronjs-icon.svg)](https://electronjs.org/)

# Introduction

This Application is a POC for:
1. Diffie-Hellman's exchanges to create a session key
2. Exchange a system key with session key.
3. Exchange encrypted data.

This application is:
* a standalone application to test the 3 previous points with 2 serial devices on the PC.
* an application to test with an Hardware STM32 which implement the three previous points.

## Getting Started

You have to install NodeJS
Recommended procedure
1. Install MSYS2
https://www.msys2.org/

Next to this step, start MSYS2 MINGW64 Shell to perform the following steps.

2. Install nvm
https://github.com/nvm-sh/nvm

Reload your .bashrc
``` bash
source ~/.bashrc
```

3. Install NodeJS

``` bash
nvm install lts/jod
nvm use lts/jod
```

Note: Angular/Electron seem to be OK with the last version (lts/krypton) of NodeJS

*Install NodeJS dependencies with npm (used by Angular App):*

``` bash
npm install
```

*Install NodeJS dependencies with npm (used by Electron main process):*

``` bash
cd app/
npm install
```

## Run App

Start MSYS2 MINGW64 Shell to perform the following steps.
You need use two terminal. You can perform this starting two MSYS2 MINGW64 Shell, or use tmux GNU/GPL tool (pacman -S tmux)  or screen GNU/GPL tool (pacman -S screen)

Run the two following command in a terminal:

``` bash
npm run ng:serve
```

``` bash
npm run electron:serve
```


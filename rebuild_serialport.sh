#!/bin/bash
cd node_modules/@serialport/bindings-cpp
../../.bin/node-gyp rebuild --release
cd ../../..

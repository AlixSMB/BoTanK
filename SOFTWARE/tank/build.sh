#!/bin/bash

x86_64-w64-mingw32-gcc -Wshadow -Wunused -Wformat -Wno-discarded-qualifiers -c ws_framing.c
x86_64-w64-mingw32-gcc -shared -o ws_framing.dll ws_framing.o

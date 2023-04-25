#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#  dect_im.py
#  
#  Copyright 2023 Xav le boss <Xav le boss@LAPTOP-5BN2M6R5>
#  
#  This program is free software; you can redistribute it and/or modify
#  it under the terms of the GNU General Public License as published by
#  the Free Software Foundation; either version 2 of the License, or
#  (at your option) any later version.
#  
#  This program is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU General Public License for more details.
#  
#  You should have received a copy of the GNU General Public License
#  along with this program; if not, write to the Free Software
#  Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston,
#  MA 02110-1301, USA.
#  
#  



import pickle
from datetime import datetime
import os
import cv2
import pygame
import numpy as np
from pygame.locals import KEYDOWN, K_ESCAPE, K_q, K_s, K_d




# Initialise Pygame, la fenêtre Pygame et la caméra OpenCV
ecran = (640, 480)
pygame.init()
pygame.display.set_caption("Camera Feed")
screen = pygame.display.set_mode(ecran)
cap = cv2.VideoCapture(0)
frame_original = None





def dessin_carre():
	
	rect_start = None
	rect_end = None
	on = False
	coordonne = []
	
	
	while True:
		screen.fill([0,0,0])
		frame = cv2.cvtColor(frame_original, cv2.COLOR_BGR2RGB)
		frame = frame.swapaxes(0,1)
		pygame.surfarray.blit_array(screen, frame)
		
		# Récupère la position de la souris et dessine un rectangle autour de la zone sélectionnée
		mouse_pos = pygame.mouse.get_pos()
		
		mouseX = mouse_pos[0]
		mouseY = mouse_pos[1]
		
		
		if rect_start is not None and rect_end is None:
			pygame.draw.rect(screen, (0, 0, 0), (rect_start, (mouseX - rect_start[0],mouseY - rect_start[1]) ),2)
		elif rect_start is not None and mouse_pressed[0] == 0:
			pygame.draw.rect(screen, (0, 0, 0), (rect_start, (rect_end[0] - rect_start[0],rect_end[1] - rect_start[1])),2)
		
		mouse_pressed = pygame.mouse.get_pressed()
		if mouse_pressed[0] and not on:
			rect_start = None
			rect_end = None
			
			rect_start = (mouseX,mouseY)
			on = True
		elif not mouse_pressed[0] and on:
			rect_end = (mouseX,mouseY)
			on = False
			
		coordonne.append((rect_start,rect_end))			
		
		pygame.display.update()		
		for event in pygame.event.get():
			if event.type == pygame.QUIT:
				sys.exit(0)
			elif event.type == KEYDOWN:		
				if event.key == K_ESCAPE or event.key == K_q:
					# Enregistre l'image avec le rectangle
					code = datetime.now().strftime('%d-%m-%Y__%H%M%S')
					cv2.imwrite(f"images/screenshot{code}.png", frame_original)
					with open(f"coord/coordonne{code}", "wb") as f : pickle.dump (coordonne, f, 0)
				
					return 

	
					
	

while True:
	
	ret, frame_original = cap.read()
	
	screen.fill([0,0,0])
	frame = cv2.cvtColor(frame_original, cv2.COLOR_BGR2RGB)
	frame = frame.swapaxes(0,1)
	pygame.surfarray.blit_array(screen, frame)
	
	pygame.display.update()
	
	for event in pygame.event.get():
			if event.type == pygame.QUIT:
				sys.exit(0)
			elif event.type == KEYDOWN:
				if event.key == K_ESCAPE or event.key == K_q:
					sys.exit(0)

				elif event.key == K_s:
					
					dessin_carre()
					
					
	
				
					












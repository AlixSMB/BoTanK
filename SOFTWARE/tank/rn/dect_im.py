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



import cv2
import pygame
import numpy as np

# Initialise Pygame, la fenêtre Pygame et la caméra OpenCV
pygame.init()
pygame.display.set_caption("Camera Feed")
screen = pygame.display.set_mode((640, 480))
cap = cv2.VideoCapture(0)


while True:
	
	ret, frame = cap.read()
	frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
	frame = np.rot90(frame)
	frame = pygame.surfarray.make_surface(frame)
	screen.blit(frame, (0, 0))
	pygame.display.flip()

    #on initialise la touche "s" pour faire un screenshot de l'image
	keys = pygame.key.get_pressed()
	if keys[pygame.K_s]:
		screenshot = pygame.surfarray.array3d(screen)
		screenshot = np.rot90(screenshot)
		screenshot = cv2.cvtColor(screenshot, cv2.COLOR_RGB2BGR)
		cv2.imshow("Screenshot", screenshot)
		cv2.waitKey(0)
		cv2.destroyAllWindows()

        # Initialise une surface Pygame pour dessiner le rectangle avec une souris
		rect_surf = pygame.Surface((640, 480), pygame.SRCALPHA)
		rect_surf.fill((0, 0, 0, 0))
		while True:
			# Affiche l'image capturée
			screen.blit(pygame.surfarray.make_surface(screenshot), (0, 0))
			screen.blit(rect_surf, (0, 0))

			# Récupère la position de la souris et dessine un rectangle autour de la zone sélectionnée
			mouse_pos = pygame.mouse.get_pos()
			mouse_pressed = pygame.mouse.get_pressed()
			if mouse_pressed[0]:
				rect_start = mouse_pos
			elif mouse_pressed[0] == 0 and rect_start is not None:
				rect_end = mouse_pos
				pygame.draw.rect(rect_surf, (255, 0, 0, 100), (rect_start, (rect_end[0] - rect_start[0], rect_end[1] - rect_start[1])))
				rect_start = None
			
			pygame.display.flip()
			keys = pygame.key.get_pressed() # On quitte la boucle
			if keys[pygame.K_d]:
				break
				
			# Enregistre l'image avec le rectangle
		cv2.imwrite("screenshot.png", screenshot)

	keys = pygame.key.get_pressed() # On sort de la boucle principale
	if keys[pygame.K_q]:
		break


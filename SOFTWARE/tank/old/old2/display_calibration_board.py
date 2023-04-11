import numpy as np
import cv2
import cv2.aruco as aruco

# HP laptop screen
PPM = 1366/0.310 # pixels/m
# Asus display
#PPM = 1920/0.476 # pixels/m
print(f"Pixels/meter set to {PPM}, make sure this is correct !")

charuco_cell_size = 0.02; # in meters
print(f"Aruco cell size set as {charuco_cell_size} m, make sure this is correct !")

charuco_cell_psize = round(charuco_cell_size * PPM) # in pixels
charuco_nbcells_w = 7
charuco_nbcells_h = 5
aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
aruco_params = aruco.DetectorParameters_create()
charuco_board = aruco.CharucoBoard_create(charuco_nbcells_w, charuco_nbcells_h, charuco_cell_psize, charuco_cell_psize/2, aruco_dict)

charuco_boardimg = charuco_board.draw([charuco_nbcells_w*charuco_cell_psize*2, charuco_nbcells_h*charuco_cell_psize*2])
#cv2.imwrite('charuco_boards/calibration_board-6X6_250.jpg', charuco_boardimg)
#print("Created calibration board image file")

while True:
	cv2.imshow('charucoboard', charuco_boardimg)
	if cv2.waitKey(0) == ord('q') : break
cv2.destroyAllWindows()

import cv2
import cv2.aruco as aruco
import pickle
import glob
import os
from util import Object
import positioning 


cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000)

CAMERADATA_FILENAME = "phone_fisheye_params_1"
print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)

dictio = aruco.Dictionary_get(aruco.DICT_6X6_250)

def newAutoBoard():
	return Object(
		cells = {}, cells_tmp = {}, cells_i = {}, # cells contains cells positioned relative to origin with smallest id, cells_tmp contains all cells
		orig = 9999
	)
auto_board = newAutoBoard()

for img in glob.glob('map_images/*.jpg'):
	image = cv2.imread(img)
	
	corners, ids = positioning.getMarkers(cameradata, image, dictio, True)
	positioning.auto_make_board(cameradata, image, auto_board, 0.0366, corners, ids, [0, 200])
	
	cv2.imshow("image", image)
	keycode = cv2.waitKey(round(1000/30))
	while keycode != ord('s'):
		keycode = cv2.waitKey(round(1000/30))

i=1
filename = f"auto_map_"
while os.path.exists(filename+str(i)+'.txt') : i+=1
filename += str(i) + '.txt'
with open(filename, "w") as mapfile:
	
	mids = list(auto_board.cells.keys())
	cornersAll = list(auto_board.cells.values())
	msg = ''
	for n in range(len(mids)) : msg += str(mids[n]) + "," + str.join(',', [str(el) for corner in cornersAll[n] for el in corner ]) + ','
	mapfile.write(msg[:-1])
print(f"Markers map written to \"{filename}\"")

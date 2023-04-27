import numpy as np
import cv2
import cv2.aruco as aruco
import pickle

from util import Object, fisheye_undistort
from positioning import auto_make_board, getBoardTransform
def newAutoBoard():
	return Object(
		cells = {}, cells_tmp = {}, cells_i = {}, # cells contains cells positioned relative to origin with smallest id, cells_tmp contains all cells
		board = None,                             # cells_i = cells info (in_refs, out_ref, etc..., ms = marker size, orig = origin id 
		orig = 9999
	)


cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000)

CAMERADATA_FILENAME = "laptopcam_fisheye_params_2"
print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)


dictio = aruco.Dictionary_get(aruco.DICT_6X6_250)
detect_params = aruco.DetectorParameters_create()
estimate_param = aruco.EstimateParameters.create()
estimate_param.pattern = aruco.CW_top_left_corner

m_obj = newAutoBoard()

transfo = None
while True:
	videoframe = fisheye_undistort(cameradata, cap.read()[1])
	
	if auto_make_board(cameradata, videoframe, m_obj, 0.035, dictio):
		pass#print(m_obj.cells)
	transfo = getBoardTransform(cameradata, videoframe, m_obj.board, dictio, transfo)
	
	cv2.imshow("image", cv2.resize(videoframe, (700, 600)))
	keycode = cv2.waitKey(round(1000/30))
	if keycode == ord('q') : break


'''
marker_s = 0.035
local_corners = np.array([[0,0,0,1],[marker_s,0,0,1],[marker_s,marker_s,0,1],[0,marker_s,0,1]], dtype=np.float32) # [x,y,z,1]*4
world_markers = {} 

def update_marker_refs(marker): # called when marker gets positioned relative to a new origin marker
	for refmarker_id in marker.in_refs: # update markers whose position is based on this one's
		refmarker = world_markers[refmarker_id]
		
		# position "refmarker" relative to new ref of "marker"
		refmarker.transitionMat = np.matmul(marker.transitionMat, refmarker.transitionMat)
		for n in range(4) : refmarker.corners[n] = np.matmul(refmarker.transitionMat, local_corners[n])[:3]
		
		# move refmarker from previous refs list to new one
		world_markers[refmarker.out_ref].in_refs.remove(refmarker_id) # TODO: use dict instead of list for in_refs ? (search time is linear for lists...)
		refmarker.out_ref = marker.out_ref
		world_markers[marker.out_ref].in_refs.append(refmarker_id)
		
		update_marker_refs(refmarker) # recurse

while True:
	videoframe = fisheye_undistort(cameradata, cap.read()[1])
	
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(ids) > 1:
		
		rvecs, tvecs, objpoints = aruco.estimatePoseSingleMarkers(corners, marker_s, cameradata['matrix'], cameradata['coeffs'], estimateParameters=estimate_param)
		
		newMarkers = False
		for mid in ids[:,0]:
			if not (mid in world_markers): # discovered new marker
				newMarkers = True
				world_markers[mid] = Object(
					corners=np.array(local_corners[:,:3], np.float32), # corner pos relative to ref (which should be origin marker once mapping is done)
					in_refs=[],                                        # markers positioned relative to us (all should be relative to marker 0 once mapping is done)
					out_ref=None,                                      # marker we are positionned relative to
					transitionMat=None                                 # [transitionMat] * [local pos] = [ref pos]
				)
		
		if newMarkers:
			orig_ind = np.argmin(ids) # origin will be marker with smallest number
			orig_id = ids[orig_ind][0]
			orig_invTransfo = getInvTransformationMatrix(rvecs[orig_ind], tvecs[orig_ind])
			orig_refs = world_markers[orig_id].in_refs
			
			for i in range(len(ids)):
				mid = ids[i][0]
				if mid == orig_id : continue
				marker = world_markers[mid]
				if marker.out_ref is not None : continue # this marker is already positioned
				else : marker.out_ref = orig_id # this marker is positioned relative to orig_id
				mrvec = rvecs[i]
				mtvec = tvecs[i]
				
				marker.transitionMat = np.matmul(orig_invTransfo, getTransformationMatrix(mrvec, mtvec))
				# express points from local coords system to orig marker coords system
				for n in range(4) : marker.corners[n] = np.matmul(marker.transitionMat, local_corners[n])[:3]
				
				orig_refs.append(mid)
				
				update_marker_refs(marker)
				
		
		for i in range(len(ids)) :
			cv2.drawFrameAxes(videoframe, cameradata['matrix'], cameradata['coeffs'], rvecs[i], tvecs[i], 0.035)
	
	cv2.imshow("image", cv2.resize(videoframe, (700, 600)))
	
	keycode = cv2.waitKey(round(1000/30))
	if keycode == ord('q') : break

for mid in world_markers:
	print(f"ID {mid}: {world_markers[mid].corners}, ref: {world_markers[mid].out_ref}")
'''

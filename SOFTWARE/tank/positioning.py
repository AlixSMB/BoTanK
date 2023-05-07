import util # util.py
Object = util.Object

import numpy as np
import scipy
from scipy.spatial import ConvexHull
import cv2
import cv2.aruco as aruco
import math

detect_params = aruco.DetectorParameters_create()
#detect_params.adaptiveThreshConstant = 1
#detect_params.cornerRefinementMethod = aruco.CORNER_REFINE_SUBPIX

def getTransformationMatrix(rvec, tvec, rmat=None):    # rvec and tvec straight from opencv function (with the weird shapes)
	# get rotation matrix from rotation vector
	rmat = cv2.Rodrigues(rvec)[0] if rmat is None else rmat
	transfo = np.zeros((4,4), np.float32)
	transfo[3,3] = 1
	transfo[0:3, 0:3] = rmat
	transfo[0:3, 3] = np.squeeze(tvec)
	return transfo
def getInvTransformationMatrix(rvec, tvec, rmat=None): #
	# get rotation matrix from rotation vector
	rmat = cv2.Rodrigues(rvec)[0] if rmat is None else rmat
	# get inverse of rotation matrix: inv(R) = transpose(R)
	invRMat = np.transpose(rmat)
	# get inverse of tranformation matrix (rotation + translation)
	# we use a fast method: https://stackoverflow.com/questions/2624422/efficient-4x4-matrix-inverse-affine-transform
	invTransfo = np.zeros((4,4), np.float32)
	invTransfo[3,3] = 1
	invTransfo[0:3, 0:3] = invRMat
	invTransfo[0:3, 3] = np.matmul(-invRMat, np.squeeze(tvec))
	return invTransfo

def update_marker_refs(m_obj, marker_i, local_corners, isGlobalOrig): # called when marker gets positioned relative to a new origin marker
	for refmarker_id in marker_i.in_refs: # update markers whose position is based on this one's
		refmarker_i = m_obj.cells_i[refmarker_id]
		
		# position "refmarker" relative to new ref of "marker"
		refmarker_i.transitionMat = np.matmul(marker_i.transitionMat, refmarker_i.transitionMat)
		for n in range(4):
			m_obj.cells_tmp[refmarker_id][n] = np.matmul(refmarker_i.transitionMat, local_corners[n])[:3]
			m_obj.cells_tmp[refmarker_id][n][2]
		if isGlobalOrig : m_obj.cells[refmarker_id] = np.copy(m_obj.cells_tmp[refmarker_id])
		
		# move refmarker from previous refs list to new one
		m_obj.cells_i[refmarker_i.out_ref].in_refs.remove(refmarker_id) # TODO: use dict instead of list for in_refs ? (search time is linear for lists...)
		refmarker_i.out_ref = marker_i.out_ref
		m_obj.cells_i[marker_i.out_ref].in_refs.append(refmarker_id)
		
		update_marker_refs(m_obj, refmarker_i, local_corners, isGlobalOrig) # recurse
# generate corners and ids automatically from frames, using relative distances between markers
# all the markers must have the same known size, and be coplanar
# "m_obj.cells" will contain all the markers which are positioned relative to the board origin marker
# (i.e: the marker with the smallest id)
def auto_make_board(cameradata, videoframe, m_obj, ms, dictio, mrange=[0,200]):
	newMarkers = False
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(ids) > 1:
		
		local_corners = np.array([[0,0,0,1],[ms,0,0,1],[ms,ms,0,1],[0,ms,0,1]], dtype=np.float32) # CW top left order, x right, y bottom [x,y,z,1]*4
		rvecs = []
		tvecs = []
		for i in range(len(ids)):
			_, rvec, tvec = cv2.solvePnP(np.array(local_corners[:,:3]), corners[i][0], cameradata['matrix'], cameradata['coeffs'], flags=cv2.SOLVEPNP_IPPE)
			rvecs.append(rvec)
			tvecs.append(tvec)
		
		for mid in ids[:,0]:
			if mid < mrange[0] or mid > mrange[1] : continue # not a marker used for positioning 
			if not (mid in m_obj.cells_tmp): # discovered new marker
				newMarkers = True
				m_obj.cells_tmp[mid] = local_corners[:,:3].copy() # corner pos relative to ref (which should be origin marker once mapping is done)
				m_obj.cells_i[mid] = Object(
					in_refs=[],        # markers positioned relative to us (all should be relative to marker 0 once mapping is done)
					out_ref=None,      # marker we are positionned relative to
					transitionMat=None # [transitionMat] * [local pos] = [ref pos]
				)
		
		if newMarkers:
			orig_ind = np.argmin(ids) # local origin will be marker with smallest number or its origin
			orig_id = np.min(ids)
			orig_ref = m_obj.cells_i[orig_id].out_ref
			if orig_ref is not None:
				orig_invTransfo = np.matmul(m_obj.cells_i[orig_id].transitionMat, getInvTransformationMatrix(rvecs[orig_ind], tvecs[orig_ind]))
				orig_id = orig_ref
			else:
				orig_invTransfo = getInvTransformationMatrix(rvecs[orig_ind], tvecs[orig_ind])
				if orig_id < m_obj.orig: # update board global origin marker
					m_obj.orig = orig_id 
					m_obj.cells = {}
					m_obj.cells[orig_id] = local_corners[:,:3]
					for mid in m_obj.cells_i[orig_id].in_refs : m_obj.cells[mid] = m_obj.cells_tmp[mid]
			
			orig_refs = m_obj.cells_i[orig_id].in_refs
			
			for i in range(len(ids)):
				mid = ids[i][0]
				if mid < mrange[0] or mid > mrange[1] : continue
				if mid == orig_id : continue
				marker_i = m_obj.cells_i[mid]
				if marker_i.out_ref is not None : continue # this marker is already positioned
				else : marker_i.out_ref = orig_id # this marker is positioned relative to orig_id
				mrvec = rvecs[i]
				mtvec = tvecs[i]
				
				marker_i.transitionMat = np.matmul(orig_invTransfo, getTransformationMatrix(mrvec, mtvec))
				# express points from local coords system to orig marker coords system
				for n in range(4): 
					m_obj.cells_tmp[mid][n] = np.matmul(marker_i.transitionMat, local_corners[n])[:3]
					m_obj.cells_tmp[mid][n][2] = 0 # planar board
				if m_obj.orig == orig_id : m_obj.cells[mid] = np.copy(m_obj.cells_tmp[mid])
				
				orig_refs.append(mid)
				update_marker_refs(m_obj, marker_i, local_corners, m_obj.orig == orig_id)
	
	return newMarkers

# get pos / rot of camera relative to board, the video frame should be distorsion free ! 
maxPosDelta = 0.1 # in m
#maxDirDelta = 0.
nb_outliers = 0
max_outliers = 10
def getBoardTransform(cameradata, videoframe, autoboard, dictio, transfo, dbview=False):
	global nb_outliers
	
	if len(autoboard.cells) == 0 : return transfo
	
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(corners) > 0:
		
		objpoints = []
		imgpoints = []
		for i in range(len(ids)):
			mid = ids[i][0]
			if not (mid in autoboard.cells) : continue
			for pnt in autoboard.cells[mid] : objpoints.append(pnt)
			for corner in corners[i][0]     : imgpoints.append(corner)
		if len(objpoints) == 0 : return transfo
		objpoints = np.array(objpoints, dtype=np.float32)
		imgpoints = np.array(imgpoints, dtype=np.float32)
		
		retval, rvec, tvec = cv2.solvePnP(objpoints, imgpoints, cameradata['matrix'], cameradata['coeffs'], flags=cv2.SOLVEPNP_IPPE)
		
		if retval:
			if dbview:
				aruco.drawDetectedMarkers(videoframe, corners, ids)
				cv2.drawFrameAxes(videoframe, cameradata['matrix'], cameradata['coeffs'], rvec, tvec, 0.04)
			
			rmat = cv2.Rodrigues(rvec)[0]
			newTransfo = getTransformationMatrix(rvec, tvec, rmat)
			invTransfo = getInvTransformationMatrix(rvec, tvec, rmat)
			
			# get cam pos (transform [0,0,0] from cam coords to board coords)
			cam_pos = np.matmul(invTransfo, np.array([0,0,0,1]))
			#if transfo is not None and nb_outliers < max_outliers and (abs(cam_pos[0]-transfo[0][0]) >= maxPosDelta or abs(cam_pos[1]-transfo[0][1])) >= maxPosDelta: 
			#	nb_outliers += 1
			#	return transfo # remove outlier data
			#else : nb_outliers = 0;
			
			# get cam rotation around board z
			# transform the optical axis (vector [0,0,1]) from cam coords to board coords
			# we must transform both points of the camera z-axis vector
			cam_forward = np.matmul(invTransfo, np.array([0,0,1,1], np.float32)) - cam_pos
			# project unto (x,y) plane of board
			cam_forward[:2] /= np.linalg.norm(cam_forward[:2])
			
			return (cam_pos, cam_forward[:2], newTransfo, invTransfo)
		else : return transfo
	else : return transfo

def getMarkedObstacles(cameradata, videoframe, dictio, mrange, s, n, collider, transfo):
	res = Object(val=[], collider=collider)
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(corners) > 0:
		
		keptCorners = []
		keptInds = []
		for i in range(len(ids)):
			if ids[i][0] < mrange[0] or ids[i][0] > mrange[1] : continue
			keptCorners.append(corners[i])
			keptInds.append(i)
		if len(keptInds) == 0 : return res
		
		local_corners = np.array([[0,0,0,1],[s,0,0,1],[s,s,0,1],[0,s,0,1]], dtype=np.float32) # CW top left order, x right, y bottom [x,y,z,1]*4
		rvecs = []
		tvecs = []
		for i in range(len(ids)):
			_, rvec, tvec = cv2.solvePnP(np.array(local_corners[:,:3]), corners[i][0], cameradata['matrix'], cameradata['coeffs'], flags=cv2.SOLVEPNP_IPPE)
			rvecs.append(rvec)
			tvecs.append(tvec)
		
		# group markers together if they are part of the same obstacle (same id)
		grouped_inds = {};
		for ind in keptInds:
			mid = ids[ind][0]
			if not mid in grouped_inds : grouped_inds[mid] = []
			grouped_inds[mid].append(ind)
		
		# express corners in board coords
		board_points = []
		for inds in grouped_inds.values():
			board_points.append([]) # new object
			for ind in inds:
				marker_transfo = np.matmul(transfo[3], getTransformationMatrix(rvecs[ind], tvecs[ind])) # marker -> camera -> board
				for i in range(4) : board_points[-1].append( np.matmul(marker_transfo, local_corners[i])[:2] ) # don't care about z
		
		# generate 2D colliders for obstacles
		if collider == 'Hull':
			for obj_pnts in board_points:
				res.val.append([])
				hull_pnts = [obj_pnts[ind] for ind in ConvexHull(obj_pnts).vertices]
				for pnt in hull_pnts: 
					res.val[-1].append(pnt[0])
					res.val[-1].append(pnt[1])
		elif collider == 'AABB':
			for obj_pnts in board_points:
				minX = 999999  ; minY = 999999
				maxX = -999999 ; maxY = -999999
				for pnt in obj_pnts:
					maxX = max(maxX, pnt[0]) ; minX = min(minX, pnt[0])
					maxY = max(maxY, pnt[1]) ; minY = min(minY, pnt[1])
				res.val += [minX, minY, maxX, maxY]
		else: # Sphere
			pass
		
		return res
	
	else : return res

# TODO:
# - allow different sized markers, provide size for each marker
# - enable cornerRefinement ?

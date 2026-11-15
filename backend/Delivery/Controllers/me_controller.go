package controllers

import (
	"net/http"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
)

// MeController: the signed-in learner's own data (Q4): see, change, delete.
type MeController struct {
	MeUc domain.MeUsecaseI
}

func NewMeController(uc domain.MeUsecaseI) *MeController {
	return &MeController{
		MeUc: uc,
	}
}

func (mc *MeController) ready(c *gin.Context) bool {
	if mc == nil || mc.MeUc == nil {
		notImplemented(c)
		return false
	}
	return true
}

// GET /api/v1/me
// The learner's profile, latest registration, identity evidence, referral and support request.
func (mc *MeController) GetMeController(c *gin.Context) {
	if !mc.ready(c) {
		return
	}
	profile, err := mc.MeUc.Get(c.Request.Context(), infrastructure.ActorFrom(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toMeDTO(profile))
}

// PATCH /api/v1/me
// Changes only the fields sent. 409 not_registered if a draft learner changes more than
// language or simple mode. 200 with the same body as GET /me.
func (mc *MeController) UpdateMeController(c *gin.Context) {
	if !mc.ready(c) {
		return
	}
	var req UpdateMeRequest
	if !bindJSON(c, &req) {
		return
	}
	profile, err := mc.MeUc.Update(c.Request.Context(), infrastructure.ActorFrom(c), req.toDomain())
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toMeDTO(profile))
}

// DELETE /api/v1/me
// Deletes the learner and everything about them and ends their sessions. 204 No Content.
func (mc *MeController) DeleteMeController(c *gin.Context) {
	if !mc.ready(c) {
		return
	}
	if err := mc.MeUc.Delete(c.Request.Context(), infrastructure.ActorFrom(c)); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

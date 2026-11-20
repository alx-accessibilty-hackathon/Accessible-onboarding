package controllers

import (
	"fmt"
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

// GET /api/v1/me/export
// Streams formatted JSON of all data stored for the authenticated learner (Q4).
func (mc *MeController) ExportMeController(c *gin.Context) {
	if !mc.ready(c) {
		return
	}
	export, err := mc.MeUc.Export(c.Request.Context(), infrastructure.ActorFrom(c))
	if err != nil {
		respondError(c, err)
		return
	}
	dto := toMeExportDTO(export)

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"bridge-data-%s.json\"", export.Profile.Learner.ID.String()))
	c.IndentedJSON(http.StatusOK, dto)
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

// POST /api/v1/me/phone-verification
// The optional phone check: texts a 6-digit code to the learner's stored phone. 503
// sms_unavailable when real SMS is off; 409 already_exists when the phone is already
// confirmed; 429 rate_limited if a code was sent less than a minute ago.
func (mc *MeController) SendPhoneCodeController(c *gin.Context) {
	if !mc.ready(c) {
		return
	}
	sent, err := mc.MeUc.SendPhoneCode(c.Request.Context(), infrastructure.ActorFrom(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, PhoneCodeSentDTO{SentTo: sent.SentTo, ExpiresAt: sent.ExpiresAt})
}

// POST /api/v1/me/phone-verification/confirm  {"code": "482913"}
// Checks the code; the phone becomes verified. Answers the profile (as GET /me).
// 422 code (required, code_wrong); 429 too_many_attempts after 5 wrong tries.
func (mc *MeController) ConfirmPhoneController(c *gin.Context) {
	if !mc.ready(c) {
		return
	}
	var req ConfirmPhoneRequest
	if !bindJSON(c, &req) {
		return
	}
	p, err := mc.MeUc.ConfirmPhone(c.Request.Context(), infrastructure.ActorFrom(c), req.Code)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, toMeDTO(p))
}

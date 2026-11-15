package controllers

import (
	"net/http"

	domain "bridge/Domain"
	infrastructure "bridge/Infrastructure"

	"github.com/gin-gonic/gin"
)

type ConsentController struct {
	ConsentUc domain.ConsentUsecaseI
}

func NewConsentController(uc domain.ConsentUsecaseI) *ConsentController {
	return &ConsentController{
		ConsentUc: uc,
	}
}

// POST /api/v1/registrations/:id/consents records a consent decision
// (e.g. data_processing, cloud_speech, sms, telegram, partner_access).
func (cc *ConsentController) CreateConsentController(c *gin.Context) {
	if cc.ConsentUc == nil {
		notImplemented(c)
		return
	}

	regID, ok := uuidParam(c, "id")
	if !ok {
		return
	}

	var req CreateConsentRequest
	if !bindJSON(c, &req) {
		return
	}

	consent := req.toDomain()
	created, err := cc.ConsentUc.CreateConsent(c.Request.Context(), infrastructure.ActorFrom(c), regID, consent)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusCreated, toConsentDTO(created))
}

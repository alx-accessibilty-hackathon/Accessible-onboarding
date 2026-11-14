package usecase

import domain "bridge/Domain"

// SpeechUsecase turns audio into text. Cloud providers are only used if the learner
// gave the cloud_speech consent. Audio is never stored.
type SpeechUsecase struct {
	ConsentRepo domain.ConsentRepositoryI
	SpeechServ  domain.SpeechService
}

func NewSpeechUsecase(crp domain.ConsentRepositoryI, sp domain.SpeechService) *SpeechUsecase {
	return &SpeechUsecase{
		ConsentRepo: crp,
		SpeechServ:  sp,
	}
}

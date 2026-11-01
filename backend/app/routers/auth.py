"""
Auth router: login, me.
"""
from datetime import timedelta
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from app.auth import (
    create_access_token,
    get_current_user,
    verify_password,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from app.database import get_session
from app.models import User, Team

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    # 1. Check Team login first (Single Team Shared Login)
    team = session.exec(select(Team).where(Team.username == form_data.username)).first()
    if team:
        if not verify_password(form_data.password, team.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
            )
        # Ensure corresponding User record exists for FK constraints
        user = session.exec(select(User).where(User.username == team.username)).first()
        if not user:
            user = User(
                username=team.username,
                hashed_password=team.hashed_password,
                display_name=team.name,
                role="contestant",
                team_id=team.id,
                is_active=True,
            )
            session.add(user)
            session.commit()
            session.refresh(user)
        elif user.team_id != team.id:
            user.team_id = team.id
            session.add(user)
            session.commit()

        token = create_access_token(
            {
                "sub": team.username,
                "team_id": team.id,
                "batch_id": team.batch_id,
                "role": "contestant",
            },
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "team_id": team.id,
                "batch_id": team.batch_id,
                "username": team.username,
                "display_name": team.name,
                "role": "contestant",
                "leader_name": team.leader_name,
                "leader_email": team.leader_email,
            },
        }

    # 2. Check User login (admin or standard user)
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    token = create_access_token(
        {"sub": user.username, "role": user.role},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    user_payload: Dict[str, Any] = {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
    }
    if user.team_id:
        user_payload["team_id"] = user.team_id

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_payload,
    }


@router.get("/me")
def me(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    team = None
    if current_user.team_id:
        team = session.get(Team, current_user.team_id)
    elif current_user.role == "contestant":
        team = session.exec(select(Team).where(Team.username == current_user.username)).first()

    data: Dict[str, Any] = {
        "id": current_user.id,
        "username": current_user.username,
        "display_name": current_user.display_name,
        "role": current_user.role,
    }
    if team:
        data.update({
            "team_id": team.id,
            "team_name": team.name,
            "leader_name": team.leader_name,
            "leader_email": team.leader_email,
            "members_info": team.members_info,
            "batch_id": team.batch_id,
            "total_score": team.total_score,
        })
    return data

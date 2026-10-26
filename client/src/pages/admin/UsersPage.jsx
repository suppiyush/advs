import { useEffect, useState } from 'react';
import { api, getApiError } from '../../api/client.js';
import { ROLE_LABEL } from '../../context/AuthContext.jsx';

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/admin/users')
      .then(({ data }) => setUsers(data.users))
      .catch((err) => setError(getApiError(err).message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!users) return <div className="page-loading">Loading…</div>;

  return (
    <section>
      <h1>Users &amp; Roles</h1>
      <p className="muted">Creating users, changing roles and deactivating accounts arrive in Increment 6.</p>
      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>
                  <span className={`badge ${u.isActive ? 'badge-green' : 'badge-grey'}`}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
